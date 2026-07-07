"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { createQr } from "@/lib/neonfin/qr";

export type WalletQrCodeProps = {
  value: string;
  className?: string;
};

export function WalletQrCode({ value, className }: WalletQrCodeProps) {
  const qr = useMemo(() => (value ? createQr(value) : null), [value]);

  if (!value) {
    return (
      <div
        className={cn(
          "flex aspect-square items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground",
          className,
        )}
      >
        Loading wallet...
      </div>
    );
  }

  if (!qr) {
    return (
      <div
        className={cn(
          "rounded-md border bg-muted p-4 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        This page URL is too long for the built-in QR code. Copy the wallet code
        instead.
      </div>
    );
  }

  const cells: string[] = [];
  qr.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) cells.push(`M${x + 4},${y + 4}h1v1h-1z`);
    });
  });

  return (
    <div className={cn("rounded-md border bg-white p-3", className)}>
      <svg
        viewBox={`0 0 ${qr.size + 8} ${qr.size + 8}`}
        role="img"
        aria-label="Wallet transfer QR code"
        className="aspect-square w-full text-black"
        shapeRendering="crispEdges"
      >
        <rect width={qr.size + 8} height={qr.size + 8} fill="white" />
        <path d={cells.join("")} fill="currentColor" />
      </svg>
    </div>
  );
}
