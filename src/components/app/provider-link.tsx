import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small "open in the provider dashboard" external link. Renders nothing when
 * `href` is null so callers can pass a maybe-link straight through.
 */
export function ProviderLink({
  href,
  children,
  className,
  iconOnly,
  title,
}: {
  href: string | null;
  children?: React.ReactNode;
  className?: string;
  iconOnly?: boolean;
  title?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      {iconOnly ? null : children}
      <ArrowUpRight className="size-3.5 shrink-0" />
    </a>
  );
}
