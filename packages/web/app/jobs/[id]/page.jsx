'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import ProgressBar from '@/components/ProgressBar';
import { useToast } from '@/components/ToastProvider';
import { useJobPolling } from '@/lib/useJobPolling';
import { apiClient, ApiError } from '@/lib/apiClient';
import { formatDateTime } from '@/lib/format';
import { STATUS_LABELS, TERMINAL_STATUSES } from '@/lib/constants';

const CANCELLABLE = new Set(['queued', 'processing']);

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params?.id;
  const { job, error, loading, refetch } = useJobPolling(jobId);
  const { addToast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const prevStatusRef = useRef(null);

  // Toast once per terminal transition (not on every 5s poll).
  useEffect(() => {
    if (!job) return;
    const prev = prevStatusRef.current;
    if (prev && prev !== job.status && TERMINAL_STATUSES.has(job.status)) {
      if (job.status === 'completed') addToast('Conversion completed — your PDF is ready.', { type: 'success' });
      else if (job.status === 'failed') addToast(job.error?.message || 'Conversion failed.', { type: 'error' });
      else if (job.status === 'cancelled') addToast('Conversion was cancelled.', { type: 'info' });
    }
    prevStatusRef.current = job.status;
  }, [job, addToast]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await apiClient.cancelJob(jobId);
      addToast('Cancelling job…', { type: 'info' });
      await refetch();
    } catch (err) {
      addToast(err instanceof ApiError ? err.message : 'Could not cancel this job.', { type: 'error' });
    } finally {
      setCancelling(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const data = await apiClient.getDownloadUrl(jobId);
      if (data?.download_url) {
        window.open(data.download_url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      addToast(err instanceof ApiError ? err.message : 'Could not get the download link.', { type: 'error' });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/jobs" className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-400">
          &larr; All conversions
        </Link>
      </div>

      {loading && !job && <p className="text-sm text-slate-500 dark:text-slate-400">Loading job…</p>}

      {error && !job && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          {error.status === 404 ? "This job doesn't exist, or belongs to a different API key." : error.message || 'Could not load this job.'}
        </div>
      )}

      {job && (
        <div className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-semibold text-slate-900 dark:text-white">{job.metadata?.title || `Job ${job.job_id}`}</h1>
              {job.metadata?.creator && <p className="text-sm text-slate-600 dark:text-slate-400">{job.metadata.creator}</p>}
            </div>
            <StatusBadge status={job.status} />
          </div>

          {/* Visually hidden live region: announces discrete status changes to
              screen reader users, distinct from the progressbar's numeric value. */}
          <p aria-live="polite" role="status" className="sr-only">
            Status: {STATUS_LABELS[job.status] || job.status}
          </p>

          {!TERMINAL_STATUSES.has(job.status) && (
            <ProgressBar value={job.progress} label="Conversion progress" indeterminate={job.status === 'queued' && !job.progress} />
          )}

          {job.status === 'failed' && job.error && (
            <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
              <p className="font-medium">Conversion failed</p>
              <p className="mt-1">{job.error.message}</p>
              {job.error.error_code && <p className="mt-1 font-mono text-xs opacity-75">{job.error.error_code}</p>}
            </div>
          )}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Job ID</dt>
              <dd className="break-all font-mono text-xs text-slate-800 dark:text-slate-200">{job.job_id}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Engine</dt>
              <dd className="capitalize text-slate-800 dark:text-slate-200">{job.engine}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Page count</dt>
              <dd className="text-slate-800 dark:text-slate-200">{job.metadata?.page_count ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Progress</dt>
              <dd className="text-slate-800 dark:text-slate-200">{job.progress ?? 0}%</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Created</dt>
              <dd className="text-slate-800 dark:text-slate-200">{formatDateTime(job.created_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Updated</dt>
              <dd className="text-slate-800 dark:text-slate-200">{formatDateTime(job.updated_at)}</dd>
            </div>
            {job.status === 'completed' && job.expires_at && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Download expires</dt>
                <dd className="text-slate-800 dark:text-slate-200">{formatDateTime(job.expires_at)}</dd>
              </div>
            )}
          </dl>

          <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            {job.status === 'completed' && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                {downloading ? 'Getting link…' : 'Download PDF'}
              </button>
            )}
            {CANCELLABLE.has(job.status) && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
              >
                {cancelling ? 'Cancelling…' : 'Cancel job'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
