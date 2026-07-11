import { CancelledPopupNotice } from "./cancelled-popup-notice";

export const metadata = { title: "Checkout cancelled · vantezzen/pay" };

export default async function CancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; returnOrigin?: string }>;
}) {
  const { orderId, returnOrigin } = await searchParams;
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <CancelledPopupNotice orderId={orderId} returnOrigin={returnOrigin} />
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Checkout cancelled</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No charge was made. You can close this window and try again.
        </p>
      </div>
    </div>
  );
}
