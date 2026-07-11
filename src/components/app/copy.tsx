"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function useCopy() {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: (v: string) => {
      void navigator.clipboard.writeText(v);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
  };
}

/** Compact inline copyable value - for ids shown next to labels. */
export function CopyInline({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      title={copied ? "Copied" : "Copy"}
      aria-label={copied ? "Copied" : `Copy ${label ?? value}`}
    >
      {label ?? value}
      {copied ? (
        <Check className="size-3 text-emerald-600" />
      ) : (
        <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

/** Full-width code block with a copy button. */
export function CodeSnippet({ code }: { code: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg border bg-muted/40">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-2 top-2 z-10 bg-muted/40"
        onClick={() => copy(code)}
        aria-label={copied ? "Copied code" : "Copy code"}
        title={copied ? "Copied" : "Copy code"}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
      <pre className="overflow-x-auto p-4 pr-12 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
