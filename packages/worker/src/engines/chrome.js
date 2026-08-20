import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
import { CHROME_TIMEOUT_MS } from '@epub2pdf/shared';
import { WorkerError } from '../lib/errors.js';

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Render the assembled HTML to PDF via headless Chrome (Puppeteer).
 * Uses the sandbox's preinstalled Chromium (PUPPETEER_EXECUTABLE_PATH /
 * CHROME_PATH) - puppeteer-core never downloads its own browser.
 */
export async function renderWithChrome({ htmlPath, outputPdfPath, options = {} }) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (!executablePath) {
    throw new WorkerError('RENDER_CHROME_FAILED', 'PUPPETEER_EXECUTABLE_PATH / CHROME_PATH is not set.');
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
        '--disable-gpu',
        '--allow-file-access-from-files',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600 });
    await page.emulateMediaType('print');

    await withTimeout(
      page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0', timeout: CHROME_TIMEOUT_MS }),
      CHROME_TIMEOUT_MS,
      'Navigation timed out',
    );

    await withTimeout(
      page.pdf({
        path: outputPdfPath,
        format: options.page_size || 'A4',
        printBackground: true,
        margin: {
          top: `${options.margin_top_in ?? 0.75}in`,
          bottom: `${options.margin_bottom_in ?? 0.75}in`,
          left: `${options.margin_left_in ?? 0.75}in`,
          right: `${options.margin_right_in ?? 0.75}in`,
        },
        displayHeaderFooter: Boolean(options.include_header || options.include_footer),
        headerTemplate: options.include_header ? options.header_template || '<span></span>' : '<span></span>',
        footerTemplate: options.include_footer
          ? options.footer_template ||
            '<div style="font-size:9px; width:100%; text-align:center; color:#666;">' +
              '<span class="pageNumber"></span> / <span class="totalPages"></span></div>'
          : '<span></span>',
        timeout: CHROME_TIMEOUT_MS,
      }),
      CHROME_TIMEOUT_MS,
      'PDF generation timed out',
    );
  } catch (err) {
    if (err instanceof WorkerError) throw err;
    const isTimeout = /timed out/i.test(err.message || '');
    throw new WorkerError(isTimeout ? 'TIMEOUT' : 'RENDER_CHROME_FAILED', err.message);
  } finally {
    await browser?.close().catch(() => {});
  }
}
