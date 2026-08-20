'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError, getStoredApiKey, setStoredApiKey } from '@/lib/apiClient';
import ThemeToggle from '@/components/ThemeToggle';
import { useToast } from '@/components/ToastProvider';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    const stored = getStoredApiKey();
    setApiKey(stored);
    setSavedKey(stored);
  }, []);

  function handleSave(event) {
    event.preventDefault();
    const trimmed = apiKey.trim();
    setStoredApiKey(trimmed);
    setSavedKey(trimmed);
    addToast('API key saved.', { type: 'success' });
  }

  function handleClear() {
    setStoredApiKey('');
    setApiKey('');
    setSavedKey('');
    addToast('API key removed from this browser.', { type: 'info' });
  }

  async function handleTest() {
    setTesting(true);
    try {
      await apiClient.listJobs({ page: 1, pageSize: 1 });
      addToast('Connected — the API key works.', { type: 'success' });
    } catch (err) {
      addToast(err instanceof ApiError ? err.message : 'Could not reach the API.', { type: 'error' });
    } finally {
      setTesting(false);
    }
  }

  const isDirty = apiKey.trim() !== savedKey;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Phase 1 uses a single API key stored in this browser &mdash; there&rsquo;s no account login yet.
        </p>
      </div>

      <section aria-labelledby="api-key-heading" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="api-key-heading" className="mb-1 text-lg font-semibold text-slate-900 dark:text-white">
          API key
        </h2>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Sent as <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">Authorization: Bearer &lt;key&gt;</code> on every
          request. Stored only in this browser&rsquo;s local storage &mdash; never sent anywhere except the API base URL below.
        </p>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="api-key-input" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              API key
            </label>
            <div className="flex gap-2">
              <input
                id="api-key-input"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck="false"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="dev-local-key"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-pressed={showKey}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={!isDirty || !apiKey.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Save key
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={!savedKey || testing}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={!savedKey && !apiKey}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
            >
              Remove key
            </button>
          </div>
          <p role="status" aria-live="polite" className="text-sm text-slate-500 dark:text-slate-400">
            {savedKey ? 'A key is currently saved in this browser.' : 'No key saved yet.'}
          </p>
        </form>
      </section>

      <section aria-labelledby="appearance-heading" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 id="appearance-heading" className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Appearance
        </h2>
        <div className="max-w-xs">
          <ThemeToggle />
        </div>
      </section>

      <section aria-labelledby="notifications-heading" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="notifications-heading" className="text-lg font-semibold text-slate-900 dark:text-white">
            Notification preferences
          </h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Coming in Phase 2
          </span>
        </div>
        <div className="flex flex-col gap-3 opacity-70">
          <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" defaultChecked disabled className="h-4 w-4 rounded border-slate-300" />
            Browser notifications when a conversion finishes
          </label>
          <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" disabled className="h-4 w-4 rounded border-slate-300" />
            Email notifications when a conversion finishes
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          These preferences aren&rsquo;t wired up to anything yet &mdash; in-app toasts already notify you while this tab is open.
        </p>
      </section>
    </div>
  );
}
