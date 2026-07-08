"use client";

import { useEffect } from "react";

export function CancelledPopupNotice() {
  useEffect(() => {
    if (!window.opener) return;
    window.opener.postMessage(
      { source: "pay", type: "checkout_cancelled" },
      "*",
    );
    window.setTimeout(() => window.close(), 900);
  }, []);

  return null;
}
