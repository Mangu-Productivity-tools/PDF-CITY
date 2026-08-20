import dns from 'node:dns/promises';
import net from 'node:net';
import { WorkerError } from './errors.js';

/**
 * SSRF hardening for outbound `file_url` fetches (packages/worker/src/lib/download.js).
 *
 * The worker fetches whatever HTTPS URL an API caller supplies. Without this
 * check, a caller could point file_url at an internal service or a cloud
 * metadata endpoint (e.g. 169.254.169.254) and use the worker as a proxy into
 * the private network. Two things make this non-trivial to close fully:
 *
 *   1. DNS can return a mix of public/private addresses, or resolve
 *      differently between "check" and "connect" (TOCTOU / DNS rebinding).
 *   2. A redirect (3xx) to a private address after the initial check passed
 *      would bypass a check done only on the original URL.
 *
 * This module isn't a complete defense against DNS rebinding (that requires
 * pinning the resolved IP and connecting to it directly, which in turn means
 * not using the high-level `fetch()` API - a reasonable Phase 2 hardening
 * step, see docs/RISKS.md). What it does do: reject any hostname that
 * resolves to a non-public address, and re-validate on every redirect hop
 * instead of only the initial URL, which closes the most common bypass.
 */

const MAX_REDIRECTS = 5;

function isDisallowedIpv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
  if (a === 0) return true; // "this network"
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
  if (a >= 224) return true; // multicast (224-239) + reserved (240-255)
  return false;
}

function isDisallowedIpv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 address - unwrap and re-check as IPv4.
    const mapped = lower.slice('::ffff:'.length);
    return net.isIP(mapped) === 4 ? isDisallowedIpv4(mapped) : true;
  }
  const firstHextet = lower.split(':')[0];
  const firstByte = parseInt(firstHextet.padStart(4, '0').slice(0, 2), 16);
  if (firstByte === 0xfe && (parseInt(firstHextet[2], 16) & 0xc) === 0x8) return true; // fe80::/10 link-local
  if (firstByte === 0xfc || firstByte === 0xfd) return true; // fc00::/7 unique local
  return false;
}

export function isDisallowedIp(ip) {
  const type = net.isIP(ip);
  if (type === 4) return isDisallowedIpv4(ip);
  if (type === 6) return isDisallowedIpv6(ip);
  return true; // couldn't classify it - fail closed
}

async function assertHostIsPublic(hostname) {
  // A bare IP literal as the hostname - validate it directly.
  if (net.isIP(hostname)) {
    if (isDisallowedIp(hostname)) {
      throw new WorkerError('INVALID_URL', `file_url resolves to a non-public address (${hostname}).`);
    }
    return;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new WorkerError('DOWNLOAD_FAILED', `Could not resolve host: ${hostname}`);
  }
  if (addresses.length === 0) {
    throw new WorkerError('DOWNLOAD_FAILED', `Host did not resolve to any address: ${hostname}`);
  }
  for (const { address } of addresses) {
    if (isDisallowedIp(address)) {
      throw new WorkerError(
        'INVALID_URL',
        `file_url host "${hostname}" resolves to a non-public address (${address}); this is not allowed.`,
      );
    }
  }
}

/**
 * fetch() an https:// URL, validating the target host (and every redirect
 * hop) resolves only to public addresses. Throws WorkerError on any
 * violation, network failure, or non-2xx final response.
 */
export async function fetchPublicHttpsUrl(initialUrl, { maxRedirects = MAX_REDIRECTS } = {}) {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'https:') {
      throw new WorkerError('INVALID_URL', `file_url must be https:// (got "${parsed.protocol}")`);
    }
    // eslint-disable-next-line no-await-in-loop
    await assertHostIsPublic(parsed.hostname);

    let response;
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await fetch(currentUrl, { redirect: 'manual' });
    } catch (err) {
      throw new WorkerError('DOWNLOAD_FAILED', err.message);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new WorkerError('DOWNLOAD_FAILED', `Redirect response (${response.status}) had no Location header.`);
      }
      currentUrl = new URL(location, currentUrl).href;
      continue; // re-validate the new host on the next loop iteration
    }

    if (!response.ok) {
      throw new WorkerError('DOWNLOAD_FAILED', `HTTP ${response.status} fetching file_url`);
    }
    return response;
  }

  throw new WorkerError('DOWNLOAD_FAILED', `Too many redirects (>${maxRedirects}) fetching file_url`);
}
