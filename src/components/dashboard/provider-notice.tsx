"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Show a one-time provider notice without leaving its query parameter sticky. */
export function ProviderNotice({ message }: { message: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    router.replace("/dashboard/providers", { scroll: false });
  }, [router]);

  if (!visible) return null;
  return (
    <div
      className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      role="status"
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span className="flex-1">{message}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="-my-1 text-amber-800 hover:bg-amber-100 hover:text-amber-950 dark:text-amber-200 dark:hover:bg-amber-900/60 dark:hover:text-amber-50"
        aria-label="Dismiss notice"
        onClick={() => setVisible(false)}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
