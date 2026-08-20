'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError, getStoredApiKey } from '@/lib/apiClient';
import { validateEpubFile, validateFileUrl, validateMarginValue } from '@/lib/validation';
import { DEFAULT_OPTIONS, ENGINE_OPTIONS, PAGE_SIZE_OPTIONS, MIN_MARGIN_IN, MAX_MARGIN_IN } from '@/lib/constants';
import { useToast } from '@/components/ToastProvider';

const MARGIN_FIELDS = [
  { key: 'margin_top_in', label: 'Top' },
  { key: 'margin_bottom_in', label: 'Bottom' },
  { key: 'margin_left_in', label: 'Left' },
  { key: 'margin_right_in', label: 'Right' },
];

export default function UploadForm() {
  const [sourceMode, setSourceMode] = useState('file');
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();
  const { addToast } = useToast();
  const fileInputId = useId();
  const fileUrlId = useId();

  function setFieldError(key, message) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  function pickFile(fileList) {
    const nextFile = fileList?.[0] || null;
    const err = validateEpubFile(nextFile);
    setFieldError('file', err);
    setFile(err ? null : nextFile);
  }

  function handleOptionChange(key, value) {
    setOptions((prev) => ({ ...prev, [key]: value }));
  }

  function handleMarginChange(key, value) {
    handleOptionChange(key, value);
    setFieldError(key, validateMarginValue(value));
  }

  function handleMarginBlur(key, value) {
    setFieldError(key, validateMarginValue(value));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    const nextErrors = {};
    if (sourceMode === 'file') {
      const err = validateEpubFile(file);
      if (err) nextErrors.file = err;
    } else {
      const err = validateFileUrl(fileUrl);
      if (err) nextErrors.fileUrl = err;
    }
    MARGIN_FIELDS.forEach(({ key }) => {
      const err = validateMarginValue(options[key]);
      if (err) nextErrors[key] = err;
    });

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormError('Please fix the highlighted fields before submitting.');
      return;
    }

    if (!getStoredApiKey()) {
      setFormError('Add an API key on the Settings page before starting a conversion.');
      return;
    }

    setSubmitting(true);
    try {
      const payloadOptions = {
        engine: options.engine,
        page_size: options.page_size,
        margin_top_in: Number(options.margin_top_in),
        margin_bottom_in: Number(options.margin_bottom_in),
        margin_left_in: Number(options.margin_left_in),
        margin_right_in: Number(options.margin_right_in),
        include_header: options.include_header,
        include_footer: options.include_footer,
        header_template: options.header_template,
        footer_template: options.footer_template,
      };

      const result = await apiClient.convert(
        sourceMode === 'file' ? { file, options: payloadOptions } : { fileUrl: fileUrl.trim(), options: payloadOptions },
      );

      addToast('Conversion started.', { type: 'success' });
      router.push(`/jobs/${result.job_id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not start the conversion. Please try again.';
      setFormError(message);
      addToast(message, { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-base font-semibold text-slate-900 dark:text-white">Source</legend>

        <div className="flex gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="source-mode"
              value="file"
              checked={sourceMode === 'file'}
              onChange={() => setSourceMode('file')}
              className="h-4 w-4 border-slate-300 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            />
            Upload a file
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="source-mode"
              value="url"
              checked={sourceMode === 'url'}
              onChange={() => setSourceMode('url')}
              className="h-4 w-4 border-slate-300 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            />
            Paste a file URL
          </label>
        </div>

        {sourceMode === 'file' ? (
          <div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                pickFile(e.dataTransfer.files);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                isDragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-300 dark:border-slate-700'
              }`}
            >
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Drag and drop an .epub file here, or{' '}
                <label htmlFor={fileInputId} className="cursor-pointer font-medium text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-400">
                  browse your computer
                </label>
                .
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">.epub files only, up to 100 MB.</p>
              <input
                id={fileInputId}
                type="file"
                accept=".epub,application/epub+zip"
                aria-describedby={errors.file ? `${fileInputId}-error` : undefined}
                aria-invalid={Boolean(errors.file)}
                className="sr-only"
                onChange={(e) => pickFile(e.target.files)}
              />
              {file && !errors.file && (
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)</p>
              )}
            </div>
            {errors.file && (
              <p id={`${fileInputId}-error`} role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
                {errors.file}
              </p>
            )}
          </div>
        ) : (
          <div>
            <label htmlFor={fileUrlId} className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              File URL (must be HTTPS)
            </label>
            <input
              id={fileUrlId}
              type="url"
              inputMode="url"
              placeholder="https://example.com/book.epub"
              value={fileUrl}
              onChange={(e) => {
                setFileUrl(e.target.value);
                if (errors.fileUrl) setFieldError('fileUrl', validateFileUrl(e.target.value));
              }}
              onBlur={(e) => setFieldError('fileUrl', validateFileUrl(e.target.value))}
              aria-describedby={errors.fileUrl ? `${fileUrlId}-error` : undefined}
              aria-invalid={Boolean(errors.fileUrl)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            {errors.fileUrl && (
              <p id={`${fileUrlId}-error`} role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
                {errors.fileUrl}
              </p>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-5 border-t border-slate-200 pt-6 dark:border-slate-800">
        <legend className="text-base font-semibold text-slate-900 dark:text-white">Conversion options</legend>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Rendering engine</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ENGINE_OPTIONS.map((engine) => (
              <label
                key={engine.value}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm ${
                  options.engine === engine.value
                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/40'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                <span className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                  <input
                    type="radio"
                    name="engine"
                    value={engine.value}
                    checked={options.engine === engine.value}
                    onChange={() => handleOptionChange('engine', engine.value)}
                    className="h-4 w-4 border-slate-300 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                  />
                  {engine.label}
                </span>
                <span className="pl-6 text-xs text-slate-500 dark:text-slate-400">{engine.hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="page-size" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Page size
            </label>
            <select
              id="page-size"
              value={options.page_size}
              onChange={(e) => handleOptionChange('page_size', e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Margins (inches, {MIN_MARGIN_IN}&ndash;{MAX_MARGIN_IN})
          </span>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {MARGIN_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label htmlFor={key} className="mb-1 block text-xs text-slate-600 dark:text-slate-400">
                  {label}
                </label>
                <input
                  id={key}
                  type="number"
                  step="0.05"
                  min={MIN_MARGIN_IN}
                  max={MAX_MARGIN_IN}
                  value={options[key]}
                  onChange={(e) => handleMarginChange(key, e.target.value)}
                  onBlur={(e) => handleMarginBlur(key, e.target.value)}
                  aria-describedby={errors[key] ? `${key}-error` : undefined}
                  aria-invalid={Boolean(errors[key])}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                {errors[key] && (
                  <p id={`${key}-error`} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">
                    {errors[key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={options.include_header}
                onChange={(e) => handleOptionChange('include_header', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
              />
              Include header
            </label>
            <label htmlFor="header-template" className="sr-only">
              Header template
            </label>
            <textarea
              id="header-template"
              rows={2}
              placeholder="Optional HTML header template"
              value={options.header_template}
              onChange={(e) => handleOptionChange('header_template', e.target.value)}
              disabled={!options.include_header}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={options.include_footer}
                onChange={(e) => handleOptionChange('include_footer', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
              />
              Include footer
            </label>
            <label htmlFor="footer-template" className="sr-only">
              Footer template
            </label>
            <textarea
              id="footer-template"
              rows={2}
              placeholder="Optional HTML footer template"
              value={options.footer_template}
              onChange={(e) => handleOptionChange('footer_template', e.target.value)}
              disabled={!options.include_footer}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/50"
            />
          </div>
        </div>
      </fieldset>

      {formError && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          {formError}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {submitting ? 'Starting conversion…' : 'Start conversion'}
        </button>
      </div>
    </form>
  );
}
