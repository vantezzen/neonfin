/**
 * Popup checkout state machine for vantezzen/pay.
 *
 * Handles the following states:
 *  - popup blocked: caller detects null from openCheckoutPopup and falls back to redirect
 *  - user closed popup: 10-second grace-period poll to catch a last-second payment
 *  - provider cancel: postMessage checkout_cancelled → immediate rejection
 *  - transient poll failure: network errors during poll are swallowed; polling continues
 *  - success via postMessage: checkout_paid message triggers a final poll to resolve
 *  - success via polling: poll detects paid order status and resolves
 *
 * Zero-dependency, browser-safe.
 */

import { PayError } from "./error";
import type { CheckoutResult, OrderStatus } from "./index";

const POPUP_POLL_MS = 1500;

type CheckoutPopupMessage = {
  source?: unknown;
  type?: unknown;
  orderId?: unknown;
};

export function popupFeatures(): string {
  if (typeof window === "undefined") return "";
  const width = Math.min(520, window.outerWidth || 520);
  const height = Math.min(760, window.outerHeight || 760);
  const left =
    (window.screenX || 0) + Math.max(0, ((window.outerWidth || width) - width) / 2);
  const top =
    (window.screenY || 0) +
    Math.max(0, ((window.outerHeight || height) - height) / 2);
  return [
    "popup=yes",
    `width=${Math.round(width)}`,
    `height=${Math.round(height)}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");
}

export function openCheckoutPopup(randomKey: () => string): Window | null {
  if (typeof window === "undefined") return null;
  const popup = window.open("", `pay_checkout_${randomKey()}`, popupFeatures());
  if (!popup) return null;

  try {
    popup.document.title = "Opening checkout";
    popup.document.body.style.cssText =
      "margin:0;min-height:100vh;display:grid;place-items:center;font:14px system-ui,sans-serif;color:#52525b;background:#fafafa";
    popup.document.body.textContent = "Opening secure checkout...";
  } catch {
    // Some browsers restrict writing even to the blank popup. Navigation below
    // still works, so this is only cosmetic.
  }
  popup.focus();
  return popup;
}

function checkoutError(code: string, message: string): PayError {
  return new PayError(0, message, { code });
}

export type WaitForPopupCheckoutDeps = {
  getOrder: (ref: string) => Promise<OrderStatus>;
  mode: "credit_codes" | "external_auth";
  setCode: (code: string) => void;
  forgetPendingOrder: (orderId: string) => void;
  baseOrigin: string;
};

export async function waitForPopupCheckout(
  result: CheckoutResult,
  popup: Window,
  deps: WaitForPopupCheckoutDeps,
): Promise<OrderStatus> {
  const { getOrder, mode, setCode, forgetPendingOrder, baseOrigin } = deps;
  return new Promise((resolve, reject) => {
    let active = true;
    let popupClosed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let closeTimer: ReturnType<typeof setInterval> | null = null;

    function cleanup() {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (closeTimer) clearInterval(closeTimer);
      window.removeEventListener("message", onMessage);
    }

    function finish(order: OrderStatus) {
      cleanup();
      forgetPendingOrder(result.orderId);
      if (order.code) setCode(order.code);
      if (!popup.closed) popup.close();
      resolve(order);
    }

    function fail(error: unknown, closePopup = false) {
      cleanup();
      if (closePopup && !popup.closed) popup.close();
      reject(error);
    }

    // A fetched order is either a confirmed success, a terminal failure, or
    // still pending (keep polling). Both pollers share this classification.
    function classify(order: OrderStatus): "paid" | "terminal" | null {
      if (order.status === "paid" && (mode === "external_auth" || order.code)) {
        return "paid";
      }
      if (
        order.status === "failed" ||
        order.status === "expired" ||
        order.status === "refunded"
      ) {
        return "terminal";
      }
      return null;
    }

    async function poll() {
      if (!active) return;
      try {
        const order = await getOrder(result.orderId);
        const outcome = classify(order);
        if (outcome === "paid") {
          finish(order);
          return;
        }
        if (outcome === "terminal") {
          forgetPendingOrder(result.orderId);
          fail(
            checkoutError(`checkout_${order.status}`, `Checkout ${order.status}.`),
            true,
          );
          return;
        }
      } catch {
        // Transient network/API errors should not strand an in-progress
        // checkout. Keep polling while the popup remains open.
      }
      if (!popupClosed) pollTimer = setTimeout(poll, POPUP_POLL_MS);
    }

    async function handleClosedPopup() {
      if (popupClosed) return;
      popupClosed = true;
      if (closeTimer) clearInterval(closeTimer);

      const deadline = Date.now() + 10_000;
      async function confirmPayment() {
        if (!active) return;
        try {
          const order = await getOrder(result.orderId);
          const outcome = classify(order);
          if (outcome === "paid") {
            finish(order);
            return;
          }
          if (outcome === "terminal") {
            forgetPendingOrder(result.orderId);
            fail(
              checkoutError(`checkout_${order.status}`, `Checkout ${order.status}.`),
            );
            return;
          }
        } catch {
          // The pending-order resume poller will retry transient failures.
        }
        if (Date.now() < deadline) {
          pollTimer = setTimeout(confirmPayment, POPUP_POLL_MS);
          return;
        }
        fail(
          checkoutError(
            "checkout_closed",
            "Checkout closed before payment could be confirmed. We'll keep checking in the background.",
          ),
        );
      }
      void confirmPayment();
    }

    function onMessage(event: MessageEvent<CheckoutPopupMessage>) {
      if (event.origin !== baseOrigin) return;
      const data = event.data;
      if (data?.source !== "pay") return;

      const matchesOrder = data.orderId === result.orderId;
      if (data.type === "checkout_paid" && matchesOrder) {
        void poll();
      }
      if (data.type === "checkout_cancelled" && matchesOrder) {
        forgetPendingOrder(result.orderId);
        fail(checkoutError("checkout_cancelled", "Checkout was cancelled."));
      }
    }

    window.addEventListener("message", onMessage);
    closeTimer = setInterval(() => {
      if (popup.closed) void handleClosedPopup();
    }, 500);
    void poll();
  });
}
