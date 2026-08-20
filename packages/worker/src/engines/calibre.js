import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CALIBRE_TIMEOUT_MS } from '@epub2pdf/shared';
import { WorkerError } from '../lib/errors.js';

const execFileAsync = promisify(execFile);

export async function isCalibreAvailable() {
  const bin = process.env.CALIBRE_PATH || 'ebook-convert';
  try {
    await execFileAsync(bin, ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Render via Calibre's `ebook-convert` CLI, fed the same sanitized combined
 * HTML the Chrome engine uses (spec: "Input HTML generated above").
 *
 * NOTE ON FLAG NAMES: these follow the source spec
 * (EPUB_to_PDF_Conversion_Service_Spec_v2.0 §"Rendering Engines > Calibre")
 * verbatim. Calibre is not installed in the dev sandbox this scaffold was
 * built in, so these flags could not be executed/verified end-to-end.
 * Before relying on this in production, confirm the exact flag names against
 * your installed Calibre version with `ebook-convert dummy.epub dummy.pdf -h`
 * (margin flag names in particular have changed across Calibre releases -
 * some versions use `--pdf-page-margin-left` etc. instead of `--margin-left`).
 * See docs/RISKS.md.
 */
export async function renderWithCalibre({ htmlPath, outputPdfPath, options = {} }) {
  const bin = process.env.CALIBRE_PATH || 'ebook-convert';
  const args = [
    htmlPath,
    outputPdfPath,
    '--paper-size', String(options.page_size || 'a4').toLowerCase(),
    '--margin-left', `${options.margin_left_in ?? 0.75}in`,
    '--margin-right', `${options.margin_right_in ?? 0.75}in`,
    '--margin-top', `${options.margin_top_in ?? 0.75}in`,
    '--margin-bottom', `${options.margin_bottom_in ?? 0.75}in`,
    '--pdf-add-toc',
    '--enable-heuristics',
    '--no-chapters-in-toc',
  ];

  try {
    await execFileAsync(bin, args, {
      timeout: CALIBRE_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024 * 1024,
    });
  } catch (err) {
    if (err.killed || /timed? ?out/i.test(err.message || '')) {
      throw new WorkerError('TIMEOUT', 'Calibre conversion timed out.');
    }
    throw new WorkerError(
      'RENDER_CALIBRE_FAILED',
      (err.stderr ? String(err.stderr) : err.message).slice(0, 2000),
    );
  }
}
