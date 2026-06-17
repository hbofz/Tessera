/**
 * ProgressBar — the grid-clock countdown and any other fractional progress.
 * value is 0..1 (fraction filled).
 */

export function ProgressBar({
  value,
  ariaLabel,
  className = "",
}: {
  value: number;
  ariaLabel?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role={ariaLabel ? "progressbar" : undefined}
      aria-label={ariaLabel}
      aria-valuenow={ariaLabel ? Math.round(pct) : undefined}
      aria-valuemin={ariaLabel ? 0 : undefined}
      aria-valuemax={ariaLabel ? 100 : undefined}
      className={`h-1.5 rounded-pill bg-surface-2 overflow-hidden ${className}`}
    >
      <div
        className="h-full bg-accent rounded-pill"
        style={{ width: `${pct}%`, transition: "width 250ms linear" }}
      />
    </div>
  );
}
