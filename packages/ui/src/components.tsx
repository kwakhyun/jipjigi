import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

export function Button({ variant = "primary", size, wide, className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
  size?: "small";
  wide?: boolean;
}) {
  return <button {...props} type={type} className={clsx("button", `button-${variant}`, size && `button-${size}`, wide && "button-wide", className)} />;
}

export function StatusBadge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "positive" | "warning" | "neutral" | "muted" }) {
  const tones = { positive: "status-paid", warning: "status-overdue", neutral: "status-upcoming", muted: "status-muted" };
  return <span {...props} className={clsx("status-badge", tones[tone], className)} />;
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return <div className="ui-field"><label htmlFor={id}>{label}</label>{children}{hint ? <p id={`${id}-hint`} className="ui-field-hint">{hint}</p> : null}</div>;
}

export function EmptyState({ title, description, icon, action, className }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return <div className={clsx("empty-state", className)}>{icon}<strong>{title}</strong>{description ? <span>{description}</span> : null}{action}</div>;
}
