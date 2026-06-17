/**
 * Button — the single button primitive (replaces every per-file primaryBtn /
 * ghostBtn / linkBtn / SubmitButton). Encodes the focus ring, disabled state,
 * dark mode, and a loading spinner once, so screens stay declarative.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner.js";

type Variant = "primary" | "secondary" | "ghost" | "link" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly loading?: boolean;
  readonly children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-pill transition " +
  "disabled:cursor-default disabled:opacity-50 select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-ink-contrast hover:opacity-90 active:scale-[0.98] disabled:hover:opacity-50",
  secondary:
    "bg-surface-2 text-text border border-border hover:bg-border/40 active:scale-[0.98]",
  ghost:
    "bg-transparent text-text border border-border hover:bg-surface-2 active:scale-[0.98]",
  danger: "bg-danger text-white hover:opacity-90 active:scale-[0.98]",
  link: "bg-transparent text-accent underline underline-offset-2 hover:opacity-80 rounded-md px-1",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-3 py-1.5",
  md: "text-[0.95rem] px-5 py-2.5",
  lg: "text-base px-7 py-3",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const sizeCls = variant === "link" ? "" : sizes[size];
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} ${sizeCls} ${className}`}
      {...rest}
    >
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}
