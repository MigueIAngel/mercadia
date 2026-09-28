/** Recycled from Shopfront: two star rows, the coloured one clipped to the score. */
export function Rating({ value, count }: { value: number; count?: number }) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-stone-500"
      aria-label={`${value.toFixed(1)} / 5`}
    >
      <span className="relative inline-block leading-none tracking-tight" aria-hidden>
        <span className="text-stone-300">★★★★★</span>
        <span
          className="absolute inset-0 overflow-hidden text-amber-500"
          style={{ width: `${percent}%` }}
        >
          ★★★★★
        </span>
      </span>
      {value > 0 ? value.toFixed(1) : '–'}
      {count !== undefined && <span className="text-stone-400">({count})</span>}
    </span>
  );
}
