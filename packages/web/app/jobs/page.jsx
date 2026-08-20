'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import JobsTable from '@/components/JobsTable';
import { apiClient, getStoredApiKey } from '@/lib/apiClient';
import { JOB_LIST_PAGE_SIZE } from '@/lib/constants';

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasApiKey, setHasApiKey] = useState(true);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.listJobs({ status: status || undefined, page, pageSize: JOB_LIST_PAGE_SIZE });
      setJobs(data?.jobs || []);
      setTotal(data?.total || 0);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    setHasApiKey(Boolean(getStoredApiKey()));
    fetchJobs();
  }, [fetchJobs]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / JOB_LIST_PAGE_SIZE)), [total]);

  function handleStatusFilterChange(nextStatus) {
    setStatus(nextStatus);
    setPage(1);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Conversions</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Every EPUB you&rsquo;ve submitted for conversion.</p>
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          + New conversion
        </Link>
      </div>

      {!hasApiKey && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          No API key configured.{' '}
          <Link href="/settings" className="font-medium underline">
            Add one in Settings
          </Link>{' '}
          to load your jobs.
        </div>
      )}

      <JobsTable
        jobs={jobs}
        loading={loading}
        error={error}
        statusFilter={status}
        onStatusFilterChange={handleStatusFilterChange}
        onRefresh={fetchJobs}
        onJobChanged={fetchJobs}
      />

      <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>
          Page {page} of {totalPages} ({total} total)
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Next
          </button>
        </div>
      </nav>
    </div>
  );
}
