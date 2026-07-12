import { notFound } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { getWalletDetail } from "@/lib/queries/wallets";
import { adjustBalance, grantWalletFeature } from "@/lib/actions/wallets";
import { computeWalletAccess, toNum } from "@/lib/credits";
import { humanizeFeatureKey } from "@/lib/features";
import {
  formatLargeNumber,
  formatDate,
  formatDateTime,
  formatMoney,
} from "@/lib/format";
import { PageHeader, SectionHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { CopyInline } from "@/components/app/copy";
import { Status, StatusDot, type StatusTone } from "@/components/app/status";
import { ProviderLink } from "@/components/app/provider-link";
import { providerCustomerUrl, providerOrderUrl } from "@/lib/providers/links";
import { RevokeFeatureButton } from "@/components/dashboard/revoke-feature-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Wallet" };

const REASON: Record<string, { label: string; tone: StatusTone }> = {
  purchase: { label: "Purchase", tone: "success" },
  deduction: { label: "Deduction", tone: "neutral" },
  free_grant: { label: "Free grant", tone: "info" },
  manual: { label: "Manual adjustment", tone: "info" },
  refund: { label: "Refund", tone: "warning" },
  expiry: { label: "Expiry", tone: "danger" },
};

export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const wallet = await getWalletDetail(user.id, id);
  if (!wallet) notFound();

  const products = wallet.project.products;
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const productUnit = new Map(products.map((p) => [p.id, p.creditUnit]));
  const balanceByProduct = new Map(
    wallet.balances.map((b) => [b.productId, b]),
  );
  const identifier = wallet.code ?? wallet.externalUserId ?? wallet.id;

  // Derived access (features + active subscriptions) - the source of truth.
  const access = await computeWalletAccess(db, wallet.id);
  const manualFeatures = new Set(wallet.featureGrants.map((g) => g.feature));
  const knownFeatures = [
    ...new Set(
      products.flatMap((product) =>
        product.prices.flatMap((price) => price.features),
      ),
    ),
  ];
  const customerOrder = wallet.orders.find((order) => order.providerCustomerId);
  const customerUrl = customerOrder
    ? providerCustomerUrl(
        customerOrder.provider,
        customerOrder.price?.product.providerAccount?.environment ??
          "production",
        wallet.providerCustomerId,
      )
    : null;

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/wallets", label: "Wallets" }}
        title={
          wallet.code ? (
            <span className="font-mono">{wallet.code}</span>
          ) : (
            identifier
          )
        }
        description={`${wallet.project.name} · ${
          wallet.kind === "code" ? "anonymous code" : "external user"
        } wallet`}
        action={<CopyInline value={identifier} label="Copy code" />}
      />

      <div className="mb-8 grid gap-2 rounded-xl border px-4 py-3 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted-foreground">Created:</span>{" "}
          <span title={wallet.createdAt.toISOString()}>
            {formatDateTime(wallet.createdAt)}
          </span>
        </p>
        <p>
          <span className="text-muted-foreground">Last seen:</span>{" "}
          <span title={wallet.lastSeenAt.toISOString()}>
            {formatDateTime(wallet.lastSeenAt)}
          </span>
        </p>
        {wallet.customerEmail ? (
          <p>
            <span className="text-muted-foreground">Email:</span>{" "}
            {wallet.customerEmail}
          </p>
        ) : null}
        {wallet.providerCustomerId ? (
          <p>
            <span className="text-muted-foreground">Provider customer:</span>{" "}
            {customerUrl ? (
              <ProviderLink href={customerUrl}>
                {wallet.providerCustomerId}
              </ProviderLink>
            ) : (
              wallet.providerCustomerId
            )}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-10">
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Balances"
            description="One balance per product. Adjustments are recorded as manual ledger entries."
          />
          {products.length === 0 ? (
            <EmptyState
              title="This project has no products yet."
              className="py-10"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {products.map((product) => {
                const bal = balanceByProduct.get(product.id);
                const value = bal ? toNum(bal.balance) : 0;
                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] text-muted-foreground">
                        {product.name}
                      </span>
                      <span className="text-xl font-semibold tracking-tight tabular-nums">
                        {formatLargeNumber(value)}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          {product.creditUnit}
                        </span>
                      </span>
                    </div>
                    <FormDialog
                      trigger="Adjust"
                      title={`Adjust ${product.name}`}
                      description={`Current balance: ${formatLargeNumber(value, product.creditUnit)}. Positive grants credits; negative debits them.`}
                      action={adjustBalance}
                      submitLabel="Apply"
                    >
                      <input type="hidden" name="walletId" value={wallet.id} />
                      <input
                        type="hidden"
                        name="productId"
                        value={product.id}
                      />
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`amount-${product.id}`}>
                          Amount ({product.creditUnit})
                        </Label>
                        <Input
                          id={`amount-${product.id}`}
                          name="amount"
                          type="number"
                          step="any"
                          placeholder="e.g. 100 or -50"
                          required
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox name="allowNegative" />
                        Allow negative balance
                      </label>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`note-${product.id}`}>
                          Note (optional)
                        </Label>
                        <Input
                          id={`note-${product.id}`}
                          name="note"
                          placeholder="Reason for this adjustment"
                        />
                      </div>
                    </FormDialog>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Access"
            description="Subscriptions and unlocked features. Access follows subscriptions and purchases automatically."
            action={
              <FormDialog
                trigger="Grant feature"
                title="Grant a feature"
                description="Manually unlock a feature for this wallet (comps, support). Revoke only removes manual grants."
                action={grantWalletFeature}
                submitLabel="Grant"
              >
                <input type="hidden" name="walletId" value={wallet.id} />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="feature">Feature key</Label>
                  <Input
                    id="feature"
                    name="feature"
                    placeholder="analytics"
                    list="known-features"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                  />
                  <datalist id="known-features">
                    {knownFeatures.map((feature) => (
                      <option key={feature} value={feature} />
                    ))}
                  </datalist>
                </div>
              </FormDialog>
            }
          />

          {wallet.subscriptions.length > 0 ? (
            <div className="flex flex-col gap-2">
              {wallet.subscriptions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {s.product.name}
                      {s.price?.label ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {s.price.label}
                        </span>
                      ) : null}
                    </span>
                    <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                      <StatusDot
                        tone={s.status === "active" ? "success" : "neutral"}
                      />
                      {s.status === "active" ? "Active" : "Canceled"}
                      {s.currentPeriodEnd
                        ? ` · ${s.status === "active" ? "renews" : "access until"} ${formatDate(s.currentPeriodEnd)}`
                        : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted-foreground">
              Unlocked features
            </span>
            {access.features.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None yet - granted by a subscription, a one-time purchase, or
                manually.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {access.features.map((f) => {
                  const manual = manualFeatures.has(f);
                  return (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                    >
                      {humanizeFeatureKey(f)}
                      {manual ? (
                        <RevokeFeatureButton walletId={wallet.id} feature={f} />
                      ) : (
                        <span
                          className="text-muted-foreground"
                          title="Granted by a subscription or purchase"
                        >
                          auto
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Orders"
            description="Checkouts that paid into this wallet."
          />
          {wallet.orders.length === 0 ? (
            <EmptyState
              title="No orders yet for this wallet."
              className="py-10"
            />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Provider</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallet.orders.map((order) => {
                    const providerUrl = providerOrderUrl(
                      order.provider,
                      order.price?.product.providerAccount?.environment ??
                        "production",
                      order.providerCheckoutId,
                    );
                    const tone: StatusTone =
                      order.status === "paid"
                        ? "success"
                        : order.status === "failed"
                          ? "danger"
                          : order.status === "pending"
                            ? "neutral"
                            : "warning";
                    return (
                      <TableRow key={order.id}>
                        <TableCell
                          className="text-muted-foreground"
                          title={order.createdAt.toISOString()}
                        >
                          {formatDateTime(order.createdAt)}
                        </TableCell>
                        <TableCell>
                          {order.price?.product.name ?? "-"}
                        </TableCell>
                        <TableCell>
                          <Status tone={tone}>
                            <span className="capitalize">{order.status}</span>
                          </Status>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(order.amountCents, order.currency)}
                        </TableCell>
                        <TableCell>
                          {providerUrl ? (
                            <ProviderLink href={providerUrl}>
                              {order.provider}
                            </ProviderLink>
                          ) : (
                            <span className="capitalize text-muted-foreground">
                              {order.provider}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Ledger"
            description="Append-only history - the source of truth for every balance."
          />
          {wallet.ledger.length === 0 ? (
            <EmptyState title="No ledger entries yet" className="py-10" />
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallet.ledger.map((entry) => {
                    const delta = toNum(entry.delta);
                    const reason = REASON[entry.reason] ?? {
                      label: entry.reason,
                      tone: "neutral" as const,
                    };
                    const note =
                      entry.metadata && typeof entry.metadata === "object"
                        ? (entry.metadata as { note?: string }).note
                        : undefined;
                    const actorUserId =
                      entry.metadata && typeof entry.metadata === "object"
                        ? (entry.metadata as { actorUserId?: string })
                            .actorUserId
                        : undefined;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          <span title={entry.createdAt.toISOString()}>
                            {formatDateTime(entry.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            <StatusDot tone={reason.tone} />
                            {reason.label}
                            {note ? (
                              <span className="text-muted-foreground">
                                · {note}
                              </span>
                            ) : null}
                            {actorUserId ? (
                              <span className="text-xs text-muted-foreground">
                                · by {actorUserId}
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {productName.get(entry.productId) ?? "-"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium tabular-nums ${
                            delta < 0
                              ? "text-foreground"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {delta > 0 ? "+" : ""}
                          {formatLargeNumber(
                            delta,
                            productUnit.get(entry.productId),
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {wallet.ledger.length === 200 ? (
            <p className="text-xs text-muted-foreground">
              Showing the latest 200 entries.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}
