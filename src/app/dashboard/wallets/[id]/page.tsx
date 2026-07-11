import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { db } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { getWalletDetail } from "@/lib/queries/wallets";
import {
  adjustBalance,
  grantWalletFeature,
  revokeWalletFeature,
} from "@/lib/actions/wallets";
import { computeWalletAccess, toNum } from "@/lib/credits";
import { humanizeFeatureKey } from "@/lib/features";
import { formatLargeNumber, formatDate, formatDateTime } from "@/lib/format";
import { PageHeader, SectionHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { CopyInline } from "@/components/app/copy";
import { StatusDot, type StatusTone } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { MutationForm } from "@/components/app/mutation-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const balanceByProduct = new Map(
    wallet.balances.map((b) => [b.productId, b]),
  );
  const identifier = wallet.code ?? wallet.externalUserId ?? wallet.id;

  // Derived access (features + active subscriptions) - the source of truth.
  const access = await computeWalletAccess(db, wallet.id);
  const manualFeatures = new Set(wallet.featureGrants.map((g) => g.feature));
  const activeSubs = wallet.subscriptions.filter((s) => s.status === "active");

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

      <div className="flex flex-col gap-10">
        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Balances"
            description="One balance per product. Adjustments are recorded as manual ledger entries."
          />
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This project has no products yet.
            </p>
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
                      description="Positive grants credits; negative debits them. Recorded as a manual ledger entry."
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
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                    />
                  </div>
                </FormDialog>
              }
            />

            {activeSubs.length > 0 ? (
              <div className="flex flex-col gap-2">
                {activeSubs.map((s) => (
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
                        <StatusDot tone="success" />
                        Active
                        {s.currentPeriodEnd
                          ? ` · renews ${formatDate(s.currentPeriodEnd)}`
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
                          <MutationForm
                            action={revokeWalletFeature}
                            successMessage="Feature grant revoked"
                          >
                            {(pending) => (
                              <>
                                <input
                                  type="hidden"
                                  name="walletId"
                                  value={wallet.id}
                                />
                                <input type="hidden" name="feature" value={f} />
                                <Button
                                  type="submit"
                                  variant="ghost"
                                  size="icon-xs"
                                  className="text-muted-foreground hover:text-destructive"
                                  title="Revoke manual grant"
                                  aria-label="Revoke manual grant"
                                  disabled={pending}
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </>
                            )}
                          </MutationForm>
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
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatDateTime(entry.createdAt)}
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
                          {formatLargeNumber(delta)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
