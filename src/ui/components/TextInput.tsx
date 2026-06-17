/**
 * CodeInput — the pair-code field. Big, monospace, centered, with a stable
 * character box so the 6 chars never overlap (the old letterSpacing hack
 * crowded them). Restricts input to the code alphabet and exposes a format hint.
 */

import { useId } from "react";

export interface CodeInputProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly length?: number;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
  /** Allowed characters (uppercased). Anything else is dropped as you type. */
  readonly pattern?: RegExp;
}

export function CodeInput({
  value,
  onChange,
  length = 6,
  label,
  hint,
  disabled,
  pattern = /[A-Z0-9]/,
}: CodeInputProps) {
  const hintId = useId();
  const clean = (raw: string) =>
    raw
      .toUpperCase()
      .split("")
      .filter((ch) => pattern.test(ch))
      .join("")
      .slice(0, length);

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(clean(e.target.value))}
        placeholder={"·".repeat(length)}
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={length}
        disabled={disabled}
        className="font-mono text-center text-3xl tracking-[0.4em] indent-[0.4em] w-[min(280px,80vw)] py-3 rounded-lg border border-border bg-surface text-text placeholder:text-text-faint disabled:opacity-50"
      />
      {hint && (
        <p id={hintId} className="text-xs text-text-faint m-0">
          {hint}
        </p>
      )}
    </div>
  );
}
