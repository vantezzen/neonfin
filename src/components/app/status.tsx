import { cn } from "@/lib/utils";

/**
 * Subtle status indicators - a small colored dot next to plain text instead
 * of filled badges, per the design language (fewer badges, real hierarchy).
 */
const TONE = {
  success: "bg-emerald-500",
  info: "bg-blue-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-muted-foreground/40",
} as const;

export type StatusTone = keyof typeof TONE;

export function StatusDot({
  tone,
  className,
}: {
  tone: StatusTone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", TONE[tone], className)}
    />
  );
}

export function Status({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        className,
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}
