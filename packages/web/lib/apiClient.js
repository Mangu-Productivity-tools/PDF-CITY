// Small fetch wrapper for the EPUB-to-PDF API (docs/API_CONTRACT.md).
//
// Phase 1 has no login system: the user pastes an API key on /settings, it is
// stored in this browser's localStorage, and every request here attaches it
// as `Authorization: Bearer <key>`.

const API_KEY_STORAGE_KEY = 'epub2pdf:apiKey';
export const API_KEY_CHANGED_EVENT = 'epub2pdf:apikey-changed';

export function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export function getStoredApiKey() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(API_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredApiKey(key) {
  if (typeof window === 'undefined') return;
  const trimmed = (key || '').trim();
  try {
    if (trimmed) window.localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
    else window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // localStorage unavailable (private browsing / storage disabled) — the
    // in-memory app state still reflects the change for this session.
  }
  window.dispatchEvent(new Event(API_KEY_CHANGED_EVENT));
}

export class ApiError extends Error {
  constructor(message, { status, errorCode, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, isFormData = false, headers = {}, signal, accept } = {}) {
  const base = getApiBaseUrl();
  const apiKey = getStoredApiKey();
  const finalHeaders = { ...headers };
  if (apiKey) finalHeaders.Authorization = `Bearer ${apiKey}`;
  if (accept) finalHeaders.Accept = accept;

  let payload = body;
  if (body !== undefined && !isFormData) {
    finalHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${base}${path}`, { method, headers: finalHeaders, body: payload, signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(
      `Could not reach the API at ${base}. Check NEXT_PUBLIC_API_BASE_URL and that the server is running.`,
      { status: 0 },
    );
  }

  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = data?.message || `Request failed with status ${res.status}.`;
    throw new ApiError(message, { status: res.status, errorCode: data?.error_code, details: data });
  }

  return data;
}

function buildOptionsPayload(options) {
  if (!options) return undefined;
  // Drop empty-string template fields rather than sending them — the API
  // schema treats header_template/footer_template as optional strings.
  const cleaned = { ...options };
  if (!cleaned.header_template) delete cleaned.header_template;
  if (!cleaned.footer_template) delete cleaned.footer_template;
  return cleaned;
}

export const apiClient = {
  /**
   * POST /convert. Provide either `file` (a File/Blob, sent as
   * multipart/form-data) or `fileUrl` (sent as JSON), never both.
   */
  convert({ file, fileUrl, options, callbackUrl } = {}) {
    const cleanedOptions = buildOptionsPayload(options);

    if (file) {
      const form = new FormData();
      form.append('file', file, file.name);
      if (callbackUrl) form.append('callback_url', callbackUrl);
      if (cleanedOptions) form.append('options', JSON.stringify(cleanedOptions));
      return request('/api/v1/convert', { method: 'POST', body: form, isFormData: true });
    }

    return request('/api/v1/convert', {
      method: 'POST',
      body: {
        file_url: fileUrl,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        ...(cleanedOptions ? { options: cleanedOptions } : {}),
      },
    });
  },

  getStatus(jobId, { signal } = {}) {
    return request(`/api/v1/status/${encodeURIComponent(jobId)}`, { signal });
  },

  listJobs({ status, from, to, page, pageSize, signal } = {}) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (page) params.set('page', String(page));
    if (pageSize) params.set('page_size', String(pageSize));
    const qs = params.toString();
    return request(`/api/v1/jobs${qs ? `?${qs}` : ''}`, { signal });
  },

  getDownloadUrl(jobId) {
    return request(`/api/v1/jobs/${encodeURIComponent(jobId)}/download`, { accept: 'application/json' });
  },

  cancelJob(jobId) {
    return request(`/api/v1/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
  },

  updateJob(jobId, options) {
    return request(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      method: 'PATCH',
      body: { options: buildOptionsPayload(options) },
    });
  },
};
