/**
 * Canonical error codes shared by the API and worker.
 * Source: EPUB_to_PDF_Conversion_Service_Spec_v2.0 §"Error Handling & Retry Logic"
 * and Master PRD v3 §7.7 "Validation & Error Codes".
 *
 * Each entry maps an internal error_code to the HTTP status the API should
 * return when that error is the terminal state of a request/job, and a
 * human-readable message template with no stack trace or internal detail
 * (per spec: "no stack traces in API").
 */
export const ErrorCodes = Object.freeze({
  // Request validation (4xx, synchronous)
  INVALID_URL: { status: 400, message: 'file_url is not a valid, reachable HTTPS URL.' },
  VALIDATION_ERROR: { status: 400, message: 'Request payload failed validation.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'Uploaded file is not a valid EPUB (application/epub+zip).' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'File exceeds MAX_EPUB_SIZE_MB.' },
  UNAUTHORIZED: { status: 401, message: 'Missing or invalid API key.' },
  FORBIDDEN: { status: 403, message: 'API key does not have the required scope.' },
  NOT_FOUND: { status: 404, message: 'Job not found.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Retry after the interval in Retry-After.' },
  CONCURRENCY_LIMIT: { status: 429, message: 'Too many concurrent jobs for this account.' },

  // Job-terminal errors (surfaced via GET /status/{job_id}.error, still 200 on the status call itself)
  DOWNLOAD_FAILED: { status: 422, message: 'Could not download the EPUB from file_url.' },
  INVALID_EPUB: { status: 422, message: 'File is not a well-formed EPUB package.' },
  DRM_NOT_SUPPORTED: { status: 422, message: 'DRM-protected EPUBs are not supported.' },
  UNZIP_FAILED: { status: 422, message: 'Could not unzip the EPUB archive.' },
  PARSE_FAILED: { status: 422, message: 'Could not parse the OPF package / spine.' },
  RENDER_CHROME_FAILED: { status: 500, message: 'Chrome rendering engine failed to produce a PDF.' },
  RENDER_CALIBRE_FAILED: { status: 500, message: 'Calibre rendering engine failed to produce a PDF.' },
  UPLOAD_FAILED: { status: 500, message: 'Could not upload the output PDF to storage.' },
  STORAGE_FAILED: { status: 500, message: 'Storage backend error.' },
  OOM: { status: 500, message: 'Worker ran out of memory while processing this job.' },
  TIMEOUT: { status: 504, message: 'Job exceeded its processing time budget.' },

  // Generic
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },
});

/**
 * Build a standard error response body.
 * @param {keyof typeof ErrorCodes} code
 * @param {string} [overrideMessage]
 */
export function errorBody(code, overrideMessage) {
  const entry = ErrorCodes[code] ?? ErrorCodes.INTERNAL_ERROR;
  return {
    error_code: ErrorCodes[code] ? code : 'INTERNAL_ERROR',
    message: overrideMessage || entry.message,
  };
}

export function statusForCode(code) {
  return (ErrorCodes[code] ?? ErrorCodes.INTERNAL_ERROR).status;
}
