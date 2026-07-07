"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { prices, products, type FreeGrant } from "@/db/schema";
import {
  requireOwnedPrice,
  requireOwnedProduct,
  requireOwnedProject,
  requireOwnedProviderAccount,
} from "@/lib/auth/dal";
import { getProvider, getProviderAccount } from "@/lib/providers";
import { parseFeatureKeys } from "@/lib/features";
import { actionError, type FormState } from "./state";

function refresh(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`);
}

const productInput = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["credits", "subscription", "one_time"]),
  creditUnit: z.string().min(1),
  renewalMode: z.enum(["refresh", "add"]).default("refresh"),
  providerAccountId: z.string().optional(),
});

function parseFreeGrant(formData: FormData): FreeGrant {
  const credits = Number(formData.get("freeGrantCredits"));
  if (!Number.isFinite(credits) || credits <= 0) return null;
  const period = String(formData.get("freeGrantPeriod"));
  return { credits, period: period === "once" ? "once" : "monthly" };
}

export async function createProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireOwnedProject(String(formData.get("projectId") ?? ""));
  // A provider account can only be attached if the caller owns it too - otherwise
  // a product could be pointed at another tenant's payment credentials.
  const rawProviderAccountId = String(formData.get("providerAccountId") ?? "");
  if (rawProviderAccountId) {
    await requireOwnedProviderAccount(rawProviderAccountId);
  }
  try {
    const parsed = productInput.parse({
      projectId: formData.get("projectId"),
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      type: formData.get("type") || "credits",
      creditUnit: String(formData.get("creditUnit") || "credits"),
      renewalMode: formData.get("renewalMode") || "refresh",
      providerAccountId: formData.get("providerAccountId") || undefined,
    });
    await db.insert(products).values({
      projectId: parsed.projectId,
      name: parsed.name,
      description: parsed.description,
      type: parsed.type,
      creditUnit: parsed.creditUnit,
      renewalMode: parsed.renewalMode,
      freeGrant: parseFreeGrant(formData),
      providerAccountId: parsed.providerAccountId || null,
    });
    refresh(parsed.projectId);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

const productUpdateInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["credits", "subscription", "one_time"]),
  creditUnit: z.string().min(1),
  renewalMode: z.enum(["refresh", "add"]).default("refresh"),
});

/** Edit a product's name, description, type, credit unit, and free grant. */
export async function updateProduct(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const product = await requireOwnedProduct(String(formData.get("id") ?? ""));
  try {
    const parsed = productUpdateInput.parse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      type: formData.get("type") || product.type,
      creditUnit: String(formData.get("creditUnit") || "credits"),
      renewalMode: formData.get("renewalMode") || product.renewalMode,
    });
    // Keep the type consistent with existing prices - checkout mode comes from
    // the type, and the provider rejects e.g. payment-mode recurring prices.
    if (parsed.type !== product.type) {
      const existing = await db.query.prices.findMany({
        where: eq(prices.productId, product.id),
        columns: { interval: true },
      });
      const hasRecurring = existing.some((p) => p.interval !== "one_time");
      const hasOneTime = existing.some((p) => p.interval === "one_time");
      if (parsed.type === "subscription" && hasOneTime) {
        return {
          error:
            "This product has one-time prices - remove them before making it a subscription.",
        };
      }
      if (parsed.type !== "subscription" && hasRecurring) {
        return {
          error:
            "This product has recurring prices - remove them before changing its type.",
        };
      }
    }
    await db
      .update(products)
      .set({
        name: parsed.name,
        description: parsed.description ?? null,
        type: parsed.type,
        creditUnit: parsed.creditUnit,
        renewalMode: parsed.renewalMode,
        freeGrant: parseFreeGrant(formData),
      })
      .where(eq(products.id, product.id));
    refresh(product.projectId);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

export async function toggleProduct(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const product = await requireOwnedProduct(id);
  const active = formData.get("active") === "true";
  await db.update(products).set({ active: !active }).where(eq(products.id, id));
  refresh(product.projectId);
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const product = await requireOwnedProduct(id);
  await db.delete(products).where(eq(products.id, id));
  refresh(product.projectId);
}

const priceInput = z.object({
  productId: z.string().min(1),
  projectId: z.string().min(1),
  label: z.string().max(60).optional(),
  amount: z.coerce.number().min(0),
  currency: z.string().min(3).max(3),
  // 0 = a pure access offer (no metered credits, just features).
  creditsGranted: z.coerce.number().min(0),
  interval: z.enum(["one_time", "month", "year"]),
});

export async function createPrice(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Scope to the product's owner, not the client-supplied projectId, so a price
  // can't be attached to (and synced onto) another tenant's product/provider.
  const product = await requireOwnedProduct(String(formData.get("productId") ?? ""));
  try {
    const parsed = priceInput.parse({
      productId: product.id,
      projectId: product.projectId,
      label: formData.get("label") || undefined,
      amount: formData.get("amount"),
      currency: String(formData.get("currency") || "USD").toUpperCase(),
      creditsGranted: formData.get("creditsGranted") || 0,
      interval: formData.get("interval") || "one_time",
    });
    // Checkout mode is derived from the product type, so a mismatched interval
    // would only fail later, at the provider, when a buyer tries to pay.
    if (product.type === "subscription" && parsed.interval === "one_time") {
      return {
        error: "A subscription product needs a recurring price (monthly or yearly).",
      };
    }
    if (product.type !== "subscription" && parsed.interval !== "one_time") {
      return {
        error: "Only subscription products can have recurring prices.",
      };
    }
    await db.insert(prices).values({
      productId: parsed.productId,
      label: parsed.label ?? null,
      amountCents: Math.round(parsed.amount * 100),
      currency: parsed.currency,
      creditsGranted: String(parsed.creditsGranted),
      features: parseFeatureKeys(String(formData.get("features") ?? "")),
      interval: parsed.interval,
    });
    // Provision the just-added price (and any prior unsynced ones) if the
    // product has a provider attached. No-op otherwise.
    await syncProductPrices(parsed.productId);
    refresh(parsed.projectId);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

const priceUpdateInput = z.object({
  label: z.string().max(60).optional(),
  creditsGranted: z.coerce.number().min(0),
  amount: z.coerce.number().min(0).optional(),
  currency: z.string().min(3).max(3).optional(),
  interval: z.enum(["one_time", "month", "year"]).optional(),
});

/**
 * Edit a price. neonFin-only fields (credits granted, tier label, features)
 * are always editable. Amount/currency/interval are locked once the price is
 * synced, because Stripe and Polar prices are immutable at the provider -
 * changing them there means deleting this price and adding a new one.
 */
export async function updatePrice(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const price = await requireOwnedPrice(String(formData.get("id") ?? ""));
  try {
    const parsed = priceUpdateInput.parse({
      label: formData.get("label") || undefined,
      creditsGranted: formData.get("creditsGranted") || 0,
      amount: formData.get("amount") ?? undefined,
      currency: formData.get("currency")
        ? String(formData.get("currency")).toUpperCase()
        : undefined,
      interval: formData.get("interval") ?? undefined,
    });
    const patch: Record<string, unknown> = {
      creditsGranted: String(parsed.creditsGranted),
      label: parsed.label ?? null,
      features: parseFeatureKeys(String(formData.get("features") ?? "")),
    };
    if (!price.providerPriceId) {
      if (parsed.amount != null) {
        patch.amountCents = Math.round(parsed.amount * 100);
      }
      if (parsed.currency) patch.currency = parsed.currency;
      if (parsed.interval) patch.interval = parsed.interval;
    }
    await db.update(prices).set(patch).where(eq(prices.id, price.id));
    refresh(price.product.projectId);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

/** Attach (or change) a product's provider account, then sync its prices. */
export async function attachProvider(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const providerAccountId = String(formData.get("providerAccountId") ?? "");
  const product = await requireOwnedProduct(String(formData.get("productId") ?? ""));
  const projectId = product.projectId;
  // Only the caller's own provider accounts may be attached.
  if (providerAccountId) await requireOwnedProviderAccount(providerAccountId);
  try {
    await db
      .update(products)
      .set({ providerAccountId: providerAccountId || null })
      .where(eq(products.id, product.id));
    await syncProductPrices(product.id);
    refresh(projectId);
    return { ok: true };
  } catch (e) {
    // The attach persisted; surface the sync failure so the user can fix keys.
    refresh(projectId);
    return actionError(e);
  }
}

/** Retry provisioning any unsynced prices (e.g. after fixing provider keys). */
export async function syncProduct(formData: FormData): Promise<void> {
  const productId = String(formData.get("id"));
  const product = await requireOwnedProduct(productId);
  await syncProductPrices(productId);
  refresh(product.projectId);
}

export async function deletePrice(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const price = await requireOwnedPrice(id);
  await db.delete(prices).where(eq(prices.id, id));
  refresh(price.product.projectId);
}

/**
 * Provision the provider-side product (once) and any of its prices that aren't
 * yet synced. Idempotent and a no-op when no provider is attached - so it's safe
 * to call after adding a price, attaching a provider, or via a manual retry.
 */
async function syncProductPrices(productId: string): Promise<void> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    with: { prices: true },
  });
  if (!product?.providerAccountId) return;

  const account = await getProviderAccount(product.providerAccountId);
  if (!account) return;
  const provider = getProvider(account);

  let providerProductId = product.providerProductId;
  if (provider.catalogMode === "shared_product" && !providerProductId) {
    if (!provider.createProduct) {
      throw new Error(
        `${account.provider} cannot create shared catalog products`,
      );
    }
    const created = await provider.createProduct({
      name: product.name,
      description: product.description ?? undefined,
    });
    providerProductId = created.providerProductId;
    await db
      .update(products)
      .set({ providerProductId })
      .where(eq(products.id, productId));
  }

  for (const price of product.prices) {
    if (price.providerPriceId) continue;
    const { providerPriceId, providerProductId: createdProductId } =
      await provider.createPrice({
        providerProductId:
          provider.catalogMode === "shared_product"
            ? (providerProductId ?? undefined)
            : undefined,
        // Polar makes one product per price - name it by tier so the provider
        // dashboard is readable. Stripe reuses one shared product (name unused).
        productName: price.label
          ? `${product.name} — ${price.label}`
          : product.name,
        productDescription: product.description ?? undefined,
        amountCents: price.amountCents,
        currency: price.currency,
        interval: price.interval,
      });
    if (!providerProductId && createdProductId) {
      providerProductId = createdProductId;
      await db
        .update(products)
        .set({ providerProductId })
        .where(eq(products.id, productId));
    }
    await db
      .update(prices)
      .set({ providerPriceId })
      .where(eq(prices.id, price.id));
  }
}
