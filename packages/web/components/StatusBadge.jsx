import { STATUS_LABELS } from '@/lib/constants';

const STYLES = {
  queued: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  processing: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  completed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  failed: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
  cancelled: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
};

export default function StatusBadge({ status }) {
  const style = STYLES[status] || STYLES.queued;
  const label = STATUS_LABELS[status] || status || 'Unknown';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}
