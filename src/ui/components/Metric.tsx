/**
 * Metric — a labelled stat card with an optional strength gauge, used by the
 * StrengthVerdict (§7) to give an intuitive sense of "strong vs weak" alongside
 * the honest number.
 */

export function Metric({
  title,
  big,
  sub,
  level,
}: {
  title: string;
  big: string;
  sub: string;
  /** 0..1 strength fill for the gauge, if applicable. */
  level?: number;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-1">
      <span className="text-sm text-text-muted">{title}</span>
      <strong className="text-2xl tracking-tight" style={{ fontVariantNumeric: "tabular-nums" }}>
        {big}
      </strong>
      {level !== undefined && (
        <div className="h-1.5 rounded-pill bg-surface-2 overflow-hidden mt-1" aria-hidden="true">
          <div
            className="h-full rounded-pill bg-accent"
            style={{ width: `${Math.max(4, Math.min(100, level * 100))}%` }}
          />
        </div>
      )}
      <span className="text-xs text-text-faint">{sub}</span>
    </div>
  );
}
