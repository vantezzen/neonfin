import { Suspense } from "react";
import { CancelledContent } from "./cancelled-content";
import { CancelledPopupNotice } from "./cancelled-popup-notice";

export const metadata = { title: "Checkout cancelled · vantezzen/pay" };

export default function CancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; returnOrigin?: string }>;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div>
        <Suspense>
          <CancelledNotice searchParams={searchParams} />
        </Suspense>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Secure checkout · powered by{" "}
          <a
            href="https://pay.vantezzen.io"
            className="font-medium hover:underline"
          >
            vantezzen/pay
          </a>
        </p>
      </div>
    </div>
  );
}

async function CancelledNotice({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; returnOrigin?: string }>;
}) {
  const { orderId, returnOrigin } = await searchParams;
  return (
    <>
      <CancelledPopupNotice orderId={orderId} returnOrigin={returnOrigin} />
      <CancelledContent returnOrigin={returnOrigin} />
    </>
  );
}
