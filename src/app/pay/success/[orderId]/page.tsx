import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SuccessPoller } from "./success-poller";

export const metadata: Metadata = { title: "Payment · neonFin" };

// Awaiting `params` is dynamic - isolate it in a Suspense boundary so the
// static shell prerenders (Cache Components).
async function Resolver({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <SuccessPoller orderId={orderId} />;
}

export default function SuccessPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <h1 className="mb-6 text-center text-xl font-semibold tracking-tight">
          Thank you
        </h1>
        <Card>
          <CardContent className="pt-6">
            <Suspense
              fallback={
                <div className="flex justify-center py-8">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <Resolver params={params} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
