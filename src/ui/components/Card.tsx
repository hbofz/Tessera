/**
 * Card — a themed surface. The base building block for screens that need a
 * contained, lifted panel (the demo app, the authenticator).
 */

import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  lifted = false,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  lifted?: boolean;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag
      className={
        "bg-surface border border-border rounded-xl p-6 sm:p-7 " +
        (lifted ? "shadow-lift " : "shadow-soft ") +
        className
      }
    >
      {children}
    </Tag>
  );
}
