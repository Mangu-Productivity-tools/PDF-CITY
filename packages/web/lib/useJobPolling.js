'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from './apiClient';
import { TERMINAL_STATUSES, POLL_INTERVAL_MS } from './constants';

/**
 * Polls GET /status/{jobId} roughly every POLL_INTERVAL_MS while the job is
 * queued/processing, and stops automatically once it reaches a terminal
 * status (completed/failed/cancelled) or a permanent error (404/401/403).
 */
export function useJobPolling(jobId) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  const fetchOnce = useCallback(async () => {
    if (!jobId) return null;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await apiClient.getStatus(jobId, { signal: controller.signal });
      setJob(data);
      setError(null);
      return data;
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setJob(null);
    setError(null);

    async function poll() {
      try {
        const data = await fetchOnce();
        if (cancelled || !data) return;
        if (!TERMINAL_STATUSES.has(data.status)) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        const permanent = err?.status === 404 || err?.status === 401 || err?.status === 403;
        if (!permanent) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, [fetchOnce]);

  return { job, error, loading, refetch: fetchOnce };
}
