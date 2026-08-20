// Mirrors the wire values documented in docs/API_CONTRACT.md (and defined in
// packages/shared/src/constants.js / jobSchema.js). Kept as local literals
// instead of importing @epub2pdf/shared directly: that package's barrel
// (packages/shared/src/index.js) also re-exports storage.js, which pulls in
// the AWS S3 SDK — a server/Node-only dependency we do not want traced into
// the browser bundle. If packages/shared ever grows a browser-safe
// sub-export for just constants/schemas, switch to importing that instead.

export const JobStatus = Object.freeze({
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export const TERMINAL_STATUSES = new Set([
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
]);

export const STATUS_LABELS = {
  [JobStatus.QUEUED]: 'Queued',
  [JobStatus.PROCESSING]: 'Processing',
  [JobStatus.COMPLETED]: 'Completed',
  [JobStatus.FAILED]: 'Failed',
  [JobStatus.CANCELLED]: 'Cancelled',
};

export const RenderEngine = Object.freeze({ CHROME: 'chrome', CALIBRE: 'calibre' });

export const ENGINE_OPTIONS = [
  { value: RenderEngine.CHROME, label: 'Chrome (headless)', hint: 'Best fidelity for CSS-heavy EPUBs.' },
  { value: RenderEngine.CALIBRE, label: 'Calibre', hint: 'Good for plain, text-focused books.' },
];

export const PageSize = Object.freeze({ A4: 'A4', LETTER: 'Letter', LEGAL: 'Legal' });

export const PAGE_SIZE_OPTIONS = [
  { value: PageSize.A4, label: 'A4' },
  { value: PageSize.LETTER, label: 'Letter' },
  { value: PageSize.LEGAL, label: 'Legal' },
];

export const MIN_MARGIN_IN = 0;
export const MAX_MARGIN_IN = 3;

export const DEFAULT_OPTIONS = Object.freeze({
  engine: RenderEngine.CHROME,
  page_size: PageSize.A4,
  margin_top_in: 0.75,
  margin_bottom_in: 0.75,
  margin_left_in: 0.75,
  margin_right_in: 0.75,
  include_header: false,
  include_footer: true,
  header_template: '',
  footer_template: '',
});

// packages/shared/src/constants.js LIMITS.MAX_EPUB_SIZE_MB default.
export const MAX_EPUB_SIZE_MB = 100;

export const JOB_LIST_PAGE_SIZE = 20;
export const POLL_INTERVAL_MS = 5000;
