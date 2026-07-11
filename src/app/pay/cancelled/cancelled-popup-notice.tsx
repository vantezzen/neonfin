"use client";

import { useEffect } from "react";

function popupOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === value ? value : null;
  } catch {
    return null;
  }
}

export function CancelledPopupNotice({
  orderId,
  returnOrigin,
}: {
  orderId?: string;
  returnOrigin?: string;
}) {
  useEffect(() => {
    const targetOrigin = popupOrigin(returnOrigin);
    if (!window.opener || !targetOrigin || !orderId) return;
    window.opener.postMessage(
      { source: "pay", type: "checkout_cancelled", orderId },
      targetOrigin,
    );
    window.setTimeout(() => window.close(), 900);
  }, [orderId, returnOrigin]);

  return null;
}
