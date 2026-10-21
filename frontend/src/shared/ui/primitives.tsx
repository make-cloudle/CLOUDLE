"use client";

import { forwardRef } from "react";

/* CLOUDLE 디자인 시스템 — 토큰은 globals.css, 컴포넌트는 여기서만 정의한다. */

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "sky" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export const buttonClass = (variant: ButtonProps["variant"] = "secondary", size: ButtonProps["size"] = "md") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[transform,background,box-shadow] duration-150",
    "active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
    size === "sm" && "h-8 px-3.5 text-[13px]",
    size === "md" && "h-11 px-5 text-sm",
    size === "lg" && "h-13 px-7 text-base",
    variant === "primary" && "bg-accent text-accent-ink shadow-soft hover:brightness-110",
    variant === "sky" && "bg-sky text-[#0f2a44] shadow-float hover:brightness-105",
    variant === "secondary" && "bg-surface text-ink shadow-soft ring-1 ring-line hover:bg-surface-2",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
    variant === "danger" && "text-danger ring-1 ring-danger/40 hover:bg-warn-soft",
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref,
) {
  return (
    <button ref={ref} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx(buttonClass(variant, size), className)} {...rest}>
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input ref={ref} aria-invalid={invalid || undefined}
        className={cx(
          "h-11 w-full rounded-2xl bg-surface px-4 text-sm text-ink shadow-soft ring-1 placeholder:text-ink-3",
          "focus:ring-2 focus:ring-sky focus:outline-none disabled:opacity-50",
          invalid ? "ring-danger" : "ring-line", className,
        )} {...rest} />
    );
  },
);

export function Chip({ active, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cx(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors",
        active ? "bg-accent text-accent-ink" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink hover:ring-line-strong",
        className,
      )}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Tag({ tone = "neutral", children }: { tone?: "neutral" | "sky" | "mint" | "warn" | "yellow" | "lavender"; children: React.ReactNode }) {
  return (
    <span className={cx(
      "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold",
      tone === "neutral" && "bg-surface-2 text-ink-2",
      tone === "sky" && "bg-sky-soft text-sky-deep",
      tone === "mint" && "bg-mint/60 text-mint-deep",
      tone === "warn" && "bg-warn-soft text-warn",
      tone === "yellow" && "bg-yellow/70 text-[#8a6416] dark:text-yellow-100",
      tone === "lavender" && "bg-lavender/70 text-[#5b4fb0] dark:text-violet-200",
    )}>
      {children}
    </span>
  );
}

export function Card({ className, children, as: As = "section", ...rest }: React.HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article";
}) {
  return <As className={cx("rounded-[24px] bg-surface p-5 shadow-soft", className)} {...rest}>{children}</As>;
}

export function Overline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cx("eyebrow", className)}>{children}</p>;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: React.ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed",
        tone === "info" && "bg-sky-soft text-ink",
        tone === "warn" && "bg-warn-soft text-ink",
        tone === "error" && "bg-warn-soft text-danger",
      )}>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx("h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-surface text-ink shadow-soft" : "text-ink-2 hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
