import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, prices } from "@/db/schema";
import { env } from "@/lib/env";
import {
  authenticate,
  corsHeaders,
  apiError,
  invalidCodeAttempt,
  preflight,
} from "@/lib/api/http";
import {
  computeWalletAccess,
  findActiveCodeWallet,
  getOrCreateExternalWallet,
  WalletExpiredError,
} from "@/lib/credits";
import { normalizeCreditCode } from "@/lib/id";
import { providerErrorMessage } from "@/lib/api/provider-errors";
import {
  createProviderCheckout,
  getProviderAccountMeta,
} from "@/lib/provider-service/client";

export function OPTIONS(): Response {
  return preflight();
}

const bodySchema = z
  .object({
    priceId: z.string().min(1),
    code: z.string().optional(),
    externalUserId: z.string().optional(),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
    customerEmail: z.string().email().optional(),
    allowPromotionCodes: z.boolean().optional(),
    discountCode: z.string().trim().min(1).max(120).optional(),
  })
  .refine((b) => !(b.code && b.externalUserId), {
    message: "Pass either code or externalUserId, not both",
  });

/** Redirect targets must be on an allowed origin (when an allowlist is set). */
function redirectAllowed(
  allowedOrigins: string[],
  url: string | undefined,
): boolean {
  if (!url || allowedOrigins.length === 0) return true;
  try {
    return allowedOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { project, keyKind, origin } = auth;
  const cors = corsHeaders(project, origin);

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, "invalid_body", parsed.error.issues[0]?.message ?? "Invalid body", cors);
  }
  const input = parsed.data;

  if (input.externalUserId && keyKind !== "secret") {
    return apiError(
      403,
      "wrong_key_kind",
      "externalUserId checkout requires a secret key",
      cors,
    );
  }
  if (input.externalUserId && project.mode !== "external_auth") {
    return apiError(
      400,
      "mode_mismatch",
      "externalUserId checkout requires an external-auth project",
      cors,
    );
  }
  if (input.code && project.mode !== "credit_codes") {
    return apiError(
      400,
      "mode_mismatch",
      "code checkout requires a credit-code project",
      cors,
    );
  }
  if (!input.code && !input.externalUserId && project.mode !== "credit_codes") {
    return apiError(
      400,
      "mode_mismatch",
      "external-auth checkout requires externalUserId",
      cors,
    );
  }

  // A publishable key is public: without this check anyone could start real
  // checkouts for the project that redirect buyers to an attacker's page.
  // Secret-key (server) callers may redirect anywhere.
  if (
    keyKind === "publishable" &&
    (!redirectAllowed(project.allowedOrigins, input.successUrl) ||
      !redirectAllowed(project.allowedOrigins, input.cancelUrl))
  ) {
    return apiError(
      400,
      "redirect_origin_not_allowed",
      "successUrl/cancelUrl must be on one of the project's allowed origins",
      cors,
    );
  }

  const price = await db.query.prices.findFirst({
    where: eq(prices.id, input.priceId),
    with: { product: true },
  });
  if (!price || price.product.projectId !== project.id) {
    return apiError(404, "price_not_found", "Price not found", cors);
  }
  if (!price.active || !price.product.active) {
    return apiError(400, "price_inactive", "Price is not active", cors);
  }
  if (!price.providerPriceId || !price.product.providerAccountId) {
    return apiError(
      400,
      "price_not_synced",
      "This price is not connected to a payment provider yet",
      cors,
    );
  }
  const account = await getProviderAccountMeta(price.product.providerAccountId);
  if (!account)
    return apiError(400, "provider_account_missing", "Provider account missing", cors);

  // Resolve the target wallet up front. For external-auth purchases we also
  // pin the order to it so fulfillment credits the account instead of minting
  // an anonymous code.
  let walletId: string | null = null;
  const code = input.code
    ? normalizeCreditCode(input.code, project.codePrefix)
    : undefined;

  if (code) {
    try {
      const wallet = await findActiveCodeWallet(project.id, code);
      if (!wallet) {
        const limit = await invalidCodeAttempt(project.id, req);
        if (!limit.ok) {
          return apiError(429, "rate_limited", "Too many invalid recovery codes", {
            ...cors,
            "Retry-After": String(limit.retryAfterSec),
          });
        }
        return apiError(404, "wallet_not_found", "Wallet not found", cors);
      }
      walletId = wallet.id;
    } catch (e) {
      if (e instanceof WalletExpiredError)
        return apiError(410, "wallet_expired", "Wallet expired", cors);
      throw e;
    }
  } else if (input.externalUserId) {
    const { wallet } = await getOrCreateExternalWallet(
      project.id,
      input.externalUserId,
    );
    walletId = wallet.id;
  }

  // Providers can't swap a plan via a fresh checkout - a second subscription to
  // the same product would just double-bill. Send the caller to the portal.
  const isRecurring = price.interval !== "one_time";
  if (isRecurring && walletId) {
    const { subscriptions } = await computeWalletAccess(db, walletId);
    if (subscriptions.some((s) => s.productId === price.product.id)) {
      return apiError(
        409,
        "already_subscribed",
        "This wallet already has an active subscription to this product. Manage it in the billing portal.",
        cors,
      );
    }
  }

  const [order] = await db
    .insert(orders)
    .values({
      projectId: project.id,
      priceId: price.id,
      walletId,
      provider: account.provider,
      amountCents: price.amountCents,
      currency: price.currency,
      customerEmail: input.customerEmail ?? null,
      productIdSnapshot: price.productId,
      creditUnitSnapshot: price.product.creditUnit,
      creditsGrantedSnapshot: price.creditsGranted,
      featuresSnapshot: price.features,
      intervalSnapshot: price.interval,
      renewalModeSnapshot: price.product.renewalMode,
      priceLabelSnapshot: price.label,
      status: "pending",
    })
    .returning();

  const base = env().NEXT_PUBLIC_APP_URL;
  const mode = price.product.type === "subscription" ? "subscription" : "payment";
  try {
    const { url, checkoutId } = await createProviderCheckout(account.id, {
      providerPriceId: price.providerPriceId,
      mode,
      successUrl: input.successUrl ?? `${base}/pay/success/${order.id}`,
      cancelUrl: input.cancelUrl ?? `${base}/pay/cancelled`,
      customerEmail: input.customerEmail,
      allowPromotionCodes: input.allowPromotionCodes,
      discountCode: input.discountCode,
      metadata: {
        orderId: order.id,
        projectId: project.id,
        ...(code ? { code } : {}),
      },
    });
    await db
      .update(orders)
      .set({ providerCheckoutId: checkoutId })
      .where(eq(orders.id, order.id));
    return Response.json({ url, checkoutId, orderId: order.id }, { headers: cors });
  } catch {
    await db
      .update(orders)
      .set({ status: "failed" })
      .where(eq(orders.id, order.id));
    return apiError(502, "provider_error", providerErrorMessage(), cors);
  }
}
