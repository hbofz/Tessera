/**
 * SegmentedTabs — the solo-mode tab switcher (replaces the ad-hoc TabButton).
 * A proper tablist with arrow-key support and a sliding "ink" pill for the
 * active tab.
 */

import type { ReactNode } from "react";

export interface TabDef<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: readonly TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex gap-1 p-1 rounded-pill bg-surface-2 border border-border"
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={
              "px-4 py-1.5 text-sm font-medium rounded-pill transition disabled:opacity-40 " +
              (active
                ? "bg-ink text-ink-contrast shadow-soft"
                : "text-text-muted hover:text-text")
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
