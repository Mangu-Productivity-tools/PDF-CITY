export default function ProgressBar({ value = 0, label, indeterminate = false }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
          <span>{label}</span>
          {!indeterminate && <span>{pct}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Conversion progress'}
        className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        <div
          className={`h-full rounded-full bg-indigo-600 dark:bg-indigo-500 ${
            indeterminate ? 'w-1/3 animate-pulse' : 'transition-[width] duration-500 ease-out'
          }`}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
