"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { creditBalances, featureGrants, products, wallets } from "@/db/schema";
import { coerceSignedCreditAmountSchema } from "@/lib/amounts";
import { requireOwnedProject, requireUser } from "@/lib/auth/dal";
import { createCodeWallet, creditWallet, toNum } from "@/lib/credits";
import { FEATURE_KEY_RE, normalizeFeatureKey } from "@/lib/features";
import { actionError, type FormState } from "./state";

/** Load a wallet and confirm the current user owns its project (or redirect). */
async function requireOwnedWallet(walletId: string) {
  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.id, walletId),
    columns: { id: true, projectId: true },
  });
  if (!wallet) return null;
  await requireOwnedProject(wallet.projectId);
  return wallet;
}

const adjustInput = z.object({
  walletId: z.string().min(1),
  productId: z.string().min(1),
  // Signed: positive grants, negative debits. Non-zero.
  amount: coerceSignedCreditAmountSchema,
  note: z.string().optional(),
});

/** Manually credit or debit a (wallet, product) balance - a `manual` ledger entry. */
export async function adjustBalance(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const walletId = String(formData.get("walletId") ?? "");
  const user = await requireUser();
  const wallet = await db.query.wallets.findFirst({
    where: eq(wallets.id, walletId),
    columns: { projectId: true },
  });
  if (!wallet) return { error: "Wallet not found" };
  // Redirects if the current user doesn't own the wallet's project.
  await requireOwnedProject(wallet.projectId);

  try {
    const parsed = adjustInput.parse({
      walletId,
      productId: formData.get("productId"),
      amount: formData.get("amount"),
      note: formData.get("note") || undefined,
    });
    // The product must belong to the wallet's project - otherwise a balance
    // could be created against an unrelated product id.
    const product = await db.query.products.findFirst({
      where: and(
        eq(products.id, parsed.productId),
        eq(products.projectId, wallet.projectId),
      ),
      columns: { id: true },
    });
    if (!product) return { error: "Unknown product for this wallet" };
    if (parsed.amount < 0 && formData.get("allowNegative") !== "on") {
      const balance = await db.query.creditBalances.findFirst({
        where: and(
          eq(creditBalances.walletId, parsed.walletId),
          eq(creditBalances.productId, parsed.productId),
        ),
        columns: { balance: true },
      });
      if (toNum(balance?.balance ?? 0) + parsed.amount < 0) {
        return {
          error:
            "This adjustment would make the balance negative. Enable Allow negative balance to continue.",
        };
      }
    }
    await creditWallet(
      parsed.walletId,
      parsed.productId,
      parsed.amount,
      "manual",
      {
        metadata: {
          ...(parsed.note ? { note: parsed.note } : {}),
          actorUserId: user.id,
        },
      },
    );
    revalidatePath(`/dashboard/wallets/${walletId}`);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

/** Mint a fresh code wallet for a project (e.g. "support gave a user credits"). */
export async function generateCode(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const projectId = String(formData.get("projectId") ?? "");
  const project = await requireOwnedProject(projectId);
  if (project.mode !== "credit_codes") {
    return { error: "This project doesn't use credit codes" };
  }
  let walletId: string;
  try {
    const { wallet } = await createCodeWallet(projectId);
    walletId = wallet.id;
  } catch (e) {
    return actionError(e);
  }
  revalidatePath("/dashboard/wallets");
  // Show the new wallet (and its code) immediately.
  redirect(`/dashboard/wallets/${walletId}`);
}

const featureInput = z.object({
  walletId: z.string().min(1),
  feature: z
    .string()
    .transform(normalizeFeatureKey)
    .refine((v) => FEATURE_KEY_RE.test(v), {
      message: "Feature must be a slug (letters, digits, - or _)",
    }),
});

/** Manually grant a feature to a wallet (a `featureGrants` row). */
export async function grantWalletFeature(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const wallet = await requireOwnedWallet(String(formData.get("walletId") ?? ""));
  if (!wallet) return { error: "Wallet not found" };
  try {
    const parsed = featureInput.parse({
      walletId: wallet.id,
      feature: formData.get("feature"),
    });
    await db
      .insert(featureGrants)
      .values({ walletId: parsed.walletId, feature: parsed.feature })
      .onConflictDoNothing();
    revalidatePath(`/dashboard/wallets/${wallet.id}`);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}

/** Remove a MANUAL feature grant (subscription/purchase access is untouched). */
export async function revokeWalletFeature(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const walletId = String(formData.get("walletId") ?? "");
    const feature = normalizeFeatureKey(String(formData.get("feature") ?? ""));
    const wallet = await requireOwnedWallet(walletId);
    if (wallet && feature) {
      await db
        .delete(featureGrants)
        .where(
          and(
            eq(featureGrants.walletId, wallet.id),
            eq(featureGrants.feature, feature),
          ),
        );
    }
    revalidatePath(`/dashboard/wallets/${walletId}`);
    return { ok: true };
  } catch (e) {
    return actionError(e);
  }
}
