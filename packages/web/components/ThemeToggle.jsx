'use client';

import { useEffect, useState } from 'react';
import { getEffectiveTheme, setStoredTheme } from '@/lib/theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getEffectiveTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setStoredTheme(next);
  }

  const isDark = mounted && theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={mounted ? isDark : undefined}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      <span>{isDark ? 'Dark mode' : 'Light mode'}</span>
      <span aria-hidden="true">{isDark ? '\u{1F319}' : '\u{2600}\u{FE0F}'}</span>
    </button>
  );
}
