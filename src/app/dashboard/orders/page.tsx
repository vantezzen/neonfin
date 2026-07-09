import { Receipt } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listOrders } from "@/lib/queries/orders";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Status, type StatusTone } from "@/components/app/status";
import { CopyInline } from "@/components/app/copy";
import { ProviderLink } from "@/components/app/provider-link";
import { providerOrderUrl } from "@/lib/providers/links";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Orders" };

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  paid: { label: "Paid", tone: "success" },
  pending: { label: "Pending", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  refunded: { label: "Refunded", tone: "warning" },
};

export default async function OrdersPage() {
  const user = await requireUser();
  const orders = await listOrders(user.id);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Checkout attempts across your projects."
      />
      {orders.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="No orders yet"
          description="Orders appear as soon as your app starts its first checkout."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const status = STATUS[o.status] ?? {
                  label: o.status,
                  tone: "neutral" as const,
                };
                const providerUrl = providerOrderUrl(
                  o.provider,
                  o.price?.product.providerAccount?.environment ?? "production",
                  o.providerCheckoutId,
                );
                return (
                  <TableRow key={o.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDateTime(o.createdAt)}
                    </TableCell>
                    <TableCell>{o.project.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.price?.product.name ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Status tone={status.tone}>{status.label}</Status>
                    </TableCell>
                    <TableCell>
                      {o.issuedCode ? (
                        <CopyInline value={o.issuedCode} />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {o.customerEmail ?? "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(o.amountCents, o.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ProviderLink
                        href={providerUrl}
                        title={`View this order in ${o.provider}`}
                      >
                        {o.provider}
                      </ProviderLink>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
