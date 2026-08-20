'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import { useToast } from '@/components/ToastProvider';
import { apiClient, ApiError } from '@/lib/apiClient';
import { STATUS_LABELS } from '@/lib/constants';
import { formatDateTime, truncate } from '@/lib/format';

const STATUS_OPTIONS = ['queued', 'processing', 'completed', 'failed', 'cancelled'];
const SORT_FIELDS = [
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Updated' },
  { value: 'status', label: 'Status' },
  { value: 'progress', label: 'Progress' },
];
const CANCELLABLE = new Set(['queued', 'processing']);

export default function JobsTable({ jobs, loading, error, statusFilter, onStatusFilterChange, onRefresh, onJobChanged }) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [busyJobId, setBusyJobId] = useState(null);
  const { addToast } = useToast();

  const visibleJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = jobs;
    if (term) {
      rows = rows.filter((job) => {
        const title = job.metadata?.title?.toLowerCase() || '';
        const creator = job.metadata?.creator?.toLowerCase() || '';
        return title.includes(term) || creator.includes(term) || job.job_id.toLowerCase().includes(term);
      });
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av = a[sortField];
      let bv = b[sortField];
      if (sortField === 'created_at' || sortField === 'updated_at') {
        av = new Date(av).getTime();
        bv = new Date(bv).getTime();
      }
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
  }, [jobs, search, sortField, sortDir]);

  async function handleCancel(jobId) {
    setBusyJobId(jobId);
    try {
      await apiClient.cancelJob(jobId);
      addToast('Job cancelled.', { type: 'info' });
      onJobChanged?.();
    } catch (err) {
      addToast(err instanceof ApiError ? err.message : 'Could not cancel this job.', { type: 'error' });
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleDownload(jobId) {
    setBusyJobId(jobId);
    try {
      const data = await apiClient.getDownloadUrl(jobId);
      if (data?.download_url) {
        window.open(data.download_url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      addToast(err instanceof ApiError ? err.message : 'Could not get the download link.', { type: 'error' });
    } finally {
      setBusyJobId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="jobs-search" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Search this page
          </label>
          <input
            id="jobs-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, author, or job ID…"
            className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="jobs-status-filter" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Status
            </label>
            <select
              id="jobs-status-filter"
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s] || s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="jobs-sort" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Sort by
            </label>
            <div className="flex gap-1">
              <select
                id="jobs-sort"
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                {SORT_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                aria-label={`Currently sorted ${sortDir === 'asc' ? 'ascending' : 'descending'}. Click to reverse.`}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {loading ? 'Loading jobs…' : `${visibleJobs.length} job${visibleJobs.length === 1 ? '' : 's'} shown.`}
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <span>{error.message || 'Could not load jobs.'}</span>
          <button type="button" onClick={onRefresh} className="shrink-0 font-medium underline">
            Retry
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[720px] divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Title</th>
              <th scope="col" className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Status</th>
              <th scope="col" className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Engine</th>
              <th scope="col" className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Created</th>
              <th scope="col" className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">Progress</th>
              <th scope="col" className="px-4 py-3 font-medium text-slate-600 dark:text-slate-300">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
            {loading && jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  Loading jobs…
                </td>
              </tr>
            )}
            {!loading && !error && visibleJobs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No conversions match yet.
                </td>
              </tr>
            )}
            {visibleJobs.map((job) => (
              <tr key={job.job_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <td className="max-w-[220px] px-4 py-3">
                  <Link href={`/jobs/${job.job_id}`} className="font-medium text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-400">
                    {job.metadata?.title || truncate(job.job_id, 18)}
                  </Link>
                  {job.metadata?.creator && <div className="truncate text-xs text-slate-500 dark:text-slate-400">{job.metadata.creator}</div>}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-4 py-3 capitalize text-slate-700 dark:text-slate-300">{job.engine}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{formatDateTime(job.created_at)}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{job.progress ?? 0}%</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {job.status === 'completed' && (
                      <button
                        type="button"
                        onClick={() => handleDownload(job.job_id)}
                        disabled={busyJobId === job.job_id}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Download
                      </button>
                    )}
                    {CANCELLABLE.has(job.status) && (
                      <button
                        type="button"
                        onClick={() => handleCancel(job.job_id)}
                        disabled={busyJobId === job.job_id}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        {busyJobId === job.job_id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                    <Link
                      href={`/jobs/${job.job_id}`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      View
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
