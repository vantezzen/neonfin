"use client";

import * as React from "react";
import { Check, ChevronRight, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type WalletCodeFieldProps = {
  value: string;
  currentCode: string | null;
  loading?: boolean;
  copied?: boolean;
  error?: string | null;
  placeholder?: string;
  className?: string;
  onValueChange: (value: string) => void;
  onCopy: () => void;
  onApply: (code: string) => void | Promise<void>;
};

export function WalletCodeField({
  value,
  currentCode,
  loading = false,
  copied = false,
  error,
  placeholder = "SKIP-XXXX-XXXX-XXXX",
  className,
  onValueChange,
  onCopy,
  onApply,
}: WalletCodeFieldProps) {
  const trimmed = value.trim().toUpperCase();
  const isDifferent = trimmed.length > 0 && trimmed !== (currentCode ?? "");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (isDifferent && !loading) void onApply(trimmed);
      }}
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono tracking-wide"
          aria-label="Wallet code"
        />
        {isDifferent ? (
          <Button
            type="submit"
            size="icon"
            disabled={loading}
            aria-label="Apply wallet code"
            title="Apply wallet code"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onCopy}
            disabled={!currentCode && !trimmed}
            aria-label="Copy wallet code"
            title="Copy wallet code"
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        )}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
