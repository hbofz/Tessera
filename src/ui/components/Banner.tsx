/**
 * Banner — a calm status/error/info strip. Used for backend errors, the
 * "set up the backend" note, and waiting hints. Color is redundant with an
 * icon glyph + tone label so it reads without color (§4b spirit).
 */

import type { ReactNode } from "react";

type Tone = "info" | "error" | "success" | "muted";

const tones: Record<Tone, { cls: string; glyph: string; word: string }> = {
  info: { cls: "border-accent/30 text-text bg-accent/5", glyph: "ⓘ", word: "Info" },
  error: { cls: "border-danger/40 text-text bg-danger/8", glyph: "⚠", word: "Error" },
  success: { cls: "border-success/40 text-text bg-success/8", glyph: "✓", word: "Done" },
  muted: { cls: "border-border text-text-muted bg-surface-2", glyph: "•", word: "Note" },
};

export function Banner({
  tone = "info",
  children,
  role,
}: {
  tone?: Tone;
  children: ReactNode;
  role?: "alert" | "status";
}) {
  const t = tones[tone];
  return (
    <div
      role={role}
      className={`flex gap-2.5 items-start text-sm rounded-lg border px-3.5 py-3 ${t.cls}`}
    >
      <span aria-hidden="true" className="mt-px leading-none">
        {t.glyph}
      </span>
      <span className="sr-only">{t.word}: </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
