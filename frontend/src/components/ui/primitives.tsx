"use client";

import { forwardRef } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ── Button ─────────────────────────────────────────────────────────── */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-base",
        variant === "primary" && "border-accent bg-accent text-accent-ink hover:opacity-90 active:opacity-80",
        variant === "secondary" && "border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-line",
        variant === "ghost" && "border-transparent bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
        variant === "danger" && "border-danger bg-transparent text-danger hover:bg-surface-2",
        className,
      )}
      {...rest}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
});

/* ── Field / Input / Select ─────────────────────────────────────────── */
export function Field({ label, hint, error, children, htmlFor }: {
  label: string; hint?: string; error?: string; children: React.ReactNode; htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold text-ink-2">{label}</label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cx(
          "h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-3",
          "focus:border-accent focus:outline-none disabled:opacity-50",
          invalid ? "border-danger" : "border-line-strong",
          className,
        )}
        {...rest}
      />
    );
  },
);

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx("relative", className)}>
      <select
        className={cx(
          "h-10 w-full appearance-none rounded-md border border-line-strong bg-surface px-3 pr-8 text-sm text-ink",
          "focus:border-accent focus:outline-none",
        )}
        {...rest}
      >
        {children}
      </select>
      <svg viewBox="0 0 12 12" className="pointer-events-none absolute top-1/2 right-3 h-3 w-3 -translate-y-1/2 text-ink-3" aria-hidden="true">
        <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/* ── Segmented control ──────────────────────────────────────────────── */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-md border border-line-strong bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 rounded-sm px-3 text-sm transition-colors",
            value === o.value ? "bg-ink text-bg" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Tag ────────────────────────────────────────────────────────────── */
export function Tag({ tone = "neutral", children, onRemove }: {
  tone?: "neutral" | "accent" | "sky" | "warn"; children: React.ReactNode; onRemove?: () => void;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-xs font-medium",
        tone === "neutral" && "border-line bg-surface-2 text-ink-2",
        tone === "accent" && "border-transparent bg-accent-soft text-accent",
        tone === "sky" && "border-transparent bg-sky-soft text-sky",
        tone === "warn" && "border-transparent bg-warn-soft text-warn",
      )}
    >
      {children}
      {onRemove && (
        <button onClick={onRemove} aria-label="remove" className="-mr-1 px-1 text-ink-3 hover:text-ink">×</button>
      )}
    </span>
  );
}

/* ── Card (보더 구분, 그림자 없음) ──────────────────────────────────── */
export function Card({ className, children, as: As = "section", ...rest }: React.HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article";
}) {
  return (
    <As className={cx("rounded-lg border border-line bg-surface p-5", className)} {...rest}>
      {children}
    </As>
  );
}

export function Overline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cx("eyebrow", className)}>{children}</p>;
}

/* ── Alert ──────────────────────────────────────────────────────────── */
export function Alert({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-md border-l-2 px-3 py-2 text-sm",
        tone === "info" && "border-sky bg-sky-soft text-ink",
        tone === "warn" && "border-warn bg-warn-soft text-ink",
        tone === "error" && "border-danger bg-surface-2 text-danger",
      )}
    >
      {children}
    </div>
  );
}
