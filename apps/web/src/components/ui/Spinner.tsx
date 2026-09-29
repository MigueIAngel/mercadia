import clsx from 'clsx';

/** Spinning ring; inherits the text color. */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={label ?? 'Loading'}
      className={clsx('h-4 w-4 animate-spin', className)}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path
        d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Three bouncing dots, for "typing" and inline waits. */
export function Dots({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1', className)} aria-hidden>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/** Centered spinner for panels that load on the client. */
export function PanelLoader({ className }: { className?: string }) {
  return (
    <div className={clsx('grid place-items-center py-10 text-accent-500', className)}>
      <Spinner className="h-8 w-8" />
    </div>
  );
}
