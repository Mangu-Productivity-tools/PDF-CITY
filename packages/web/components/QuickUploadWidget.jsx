'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient, ApiError, getStoredApiKey } from '@/lib/apiClient';
import { validateEpubFile, validateFileUrl } from '@/lib/validation';
import { DEFAULT_OPTIONS } from '@/lib/constants';
import { useToast } from '@/components/ToastProvider';

/** Dashboard widget: starts a conversion immediately with default options.
 * For per-job engine/page-size/margin control, use the full /upload page. */
export default function QuickUploadWidget() {
  const [mode, setMode] = useState('file');
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fieldError, setFieldError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();
  const { addToast } = useToast();
  const fileInputId = useId();
  const urlInputId = useId();

  function pickFile(fileList) {
    const nextFile = fileList?.[0] || null;
    const err = validateEpubFile(nextFile);
    setFieldError(err);
    setFile(err ? null : nextFile);
    setMode('file');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const err = mode === 'file' ? validateEpubFile(file) : validateFileUrl(fileUrl);
    if (err) {
      setFieldError(err);
      return;
    }
    if (!getStoredApiKey()) {
      setFieldError('Add an API key on the Settings page first.');
      return;
    }

    setFieldError(null);
    setSubmitting(true);
    try {
      const result = await apiClient.convert(
        mode === 'file' ? { file, options: DEFAULT_OPTIONS } : { fileUrl: fileUrl.trim(), options: DEFAULT_OPTIONS },
      );
      addToast('Conversion started.', { type: 'success' });
      router.push(`/jobs/${result.job_id}`);
    } catch (err2) {
      const message = err2 instanceof ApiError ? err2.message : 'Could not start the conversion.';
      setFieldError(message);
      addToast(message, { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="quick-upload-heading"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between">
        <h2 id="quick-upload-heading" className="text-lg font-semibold text-slate-900 dark:text-white">
          Quick upload
        </h2>
        <Link href="/upload" className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-400">
          More options &rarr;
        </Link>
      </div>

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
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
          isDragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-300 dark:border-slate-700'
        }`}
      >
        <p className="text-slate-600 dark:text-slate-300">
          Drag an .epub file here, or{' '}
          <label htmlFor={fileInputId} className="cursor-pointer font-medium text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-400">
            browse
          </label>
          .
        </p>
        <input id={fileInputId} type="file" accept=".epub,application/epub+zip" className="sr-only" onChange={(e) => pickFile(e.target.files)} />
        {file && <p className="text-xs text-slate-500 dark:text-slate-400">Selected: {file.name}</p>}
      </div>

      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        or
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={urlInputId} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Paste a file URL
        </label>
        <input
          id={urlInputId}
          type="url"
          inputMode="url"
          placeholder="https://example.com/book.epub"
          value={fileUrl}
          onChange={(e) => {
            setFileUrl(e.target.value);
            setMode('url');
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
      </div>

      {fieldError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {fieldError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        {submitting ? 'Starting…' : 'Convert with default settings'}
      </button>
    </form>
  );
}
