'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QuickUploadWidget from '@/components/QuickUploadWidget';
import StatusBadge from '@/components/StatusBadge';
import { apiClient, getStoredApiKey } from '@/lib/apiClient';
import { formatDateTime } from '@/lib/format';

const SUMMARY_STATUSES = ['queued', 'processing', 'completed', 'failed'];

export default function DashboardPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasApiKey, setHasApiKey] = useState(true);

  useEffect(() => {
    let active = true;
    setHasApiKey(Boolean(getStoredApiKey()));

    (async () => {
      setLoading(true);
      try {
        const data = await apiClient.listJobs({ page: 1, pageSize: 5 });
        if (!active) return;
        const rows = [...(data?.jobs || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setJobs(rows);
        setError(null);
      } catch (err) {
        if (active) setError(err);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const counts = jobs.reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">A quick look at your EPUB &rarr; PDF conversions.</p>
      </div>

      {!hasApiKey && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          No API key configured yet.{' '}
          <Link href="/settings" className="font-medium underline">
            Add one in Settings
          </Link>{' '}
          to start converting.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent conversions</h2>
            <Link href="/jobs" className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-400">
              View all &rarr;
            </Link>
          </div>

          {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              Could not load recent conversions: {error.message}
            </p>
          )}
          {!loading && !error && jobs.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              No conversions yet. Start one with the quick upload panel.
            </p>
          )}

          {jobs.length > 0 && (
            <ul className="flex flex-col gap-3">
              {jobs.map((job) => (
                <li key={job.job_id}>
                  <Link
                    href={`/jobs/${job.job_id}`}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-white">{job.metadata?.title || job.job_id}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(job.created_at)}</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {jobs.length > 0 && (
            <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SUMMARY_STATUSES.map((status) => (
                <div key={status} className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-800">
                  <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{status}</dt>
                  <dd className="text-xl font-semibold text-slate-900 dark:text-white">{counts[status] || 0}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div>
          <QuickUploadWidget />
        </div>
      </div>
    </div>
  );
}
