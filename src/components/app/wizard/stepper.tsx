"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A horizontal step indicator shared by the dialog wizards (provider connect,
 * project) and the home setup checklist. `current` is the 0-indexed active
 * step; earlier steps render as completed (check), later steps as muted.
 */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: readonly string[];
  current: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {steps.map((label, i) => (
        <div key={label} className="flex flex-1 items-center gap-2 last:flex-none">
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
              i < current
                ? "bg-primary text-primary-foreground"
                : i === current
                  ? "border-2 border-primary text-foreground"
                  : "border text-muted-foreground",
            )}
          >
            {i < current ? <Check className="size-3" /> : i + 1}
          </span>
          <span
            className={cn(
              "whitespace-nowrap text-xs",
              i === current ? "font-medium" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
          {i < steps.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
        </div>
      ))}
    </div>
  );
}
