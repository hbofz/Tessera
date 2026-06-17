/**
 * Spinner — one shared, theme-aware loading indicator. The keyframes live in
 * index.css so it animates regardless of when component CSS loads.
 */

export function Spinner({ size = 24, label }: { size?: number; label?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(2, Math.round(size / 8)),
        animation: "tessera-spin 0.8s linear infinite",
      }}
      className="inline-block rounded-full border-solid border-border border-t-accent"
    />
  );
}
