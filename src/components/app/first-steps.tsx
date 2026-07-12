"use client";

import type * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type FirstStep = {
  title: string;
  description: string;
  action?: React.ReactNode;
  note?: string;
  /** Omit for guidance steps that cannot be detected automatically. */
  done?: boolean;
};

export function FirstSteps({
  title = "First steps",
  description,
  steps,
  className,
}: {
  title?: string;
  description: string;
  steps: FirstStep[];
  className?: string;
}) {
  const trackable = steps.filter((step) => step.done !== undefined);
  const doneCount = trackable.filter((step) => step.done).length;
  const currentIndex = steps.findIndex((step) => step.done === false);

  return (
    <section className={cn("overflow-hidden rounded-xl border", className)}>
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="text-[13px] text-muted-foreground">{description}</p>
        </div>
        {trackable.length > 0 ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {doneCount} / {trackable.length}
          </span>
        ) : null}
      </div>
      {trackable.length > 0 ? (
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${(doneCount / trackable.length) * 100}%` }}
          />
        </div>
      ) : null}
      <ol className="divide-y">
        {steps.map((step, index) => {
          const done = step.done === true;
          const isCurrent = index === currentIndex;
          return (
            <li
              key={step.title}
              className="flex items-center gap-4 px-5 py-3.5 sm:py-4"
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  done
                    ? "bg-emerald-500 text-white"
                    : isCurrent
                      ? "border-[1.5px] border-primary text-foreground"
                      : "border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-sm font-medium",
                    done && "text-muted-foreground",
                  )}
                >
                  {step.title}
                </div>
                {!done ? (
                  <p className="text-[13px] text-muted-foreground">
                    {step.description}
                  </p>
                ) : null}
                {step.note ? (
                  <p className="mt-0.5 text-[13px] text-amber-700 dark:text-amber-300">
                    {step.note}
                  </p>
                ) : null}
              </div>
              {(!done || step.note) && step.action ? (
                <div className="shrink-0">{step.action}</div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
