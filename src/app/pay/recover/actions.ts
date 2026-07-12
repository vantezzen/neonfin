"use server";

import { headers } from "next/headers";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, products, projects } from "@/db/schema";
import { consumeToken } from "@/lib/api/rate-limit";
import { escapeHtml, sendEmail } from "@/lib/email";
import { createWalletTransferUrl } from "@/lib/pay/qr";
import { createQrSvg } from "@/lib/pay/qr-svg";

export type WalletRecoveryState = {
  error?: string;
  message?: string;
};

const recoverySchema = z.object({
  email: z.string().trim().email(),
  returnUrl: z.string().trim().optional(),
});

const WALLET_RECOVERY_LIMIT = {
  capacity: 5,
  refillPerSec: 5 / 3600,
};

export async function recoverWalletByEmail(
  _prev: WalletRecoveryState,
  formData: FormData,
): Promise<WalletRecoveryState> {
  const parsed = recoverySchema.safeParse({
    email: formData.get("email"),
    returnUrl: formData.get("returnUrl") || undefined,
  });
  if (!parsed.success) return { error: "Enter a valid email address." };

  const email = parsed.data.email.toLowerCase();
  const requestHeaders = await headers();
  const ip = clientIpFromHeaders(requestHeaders);
  const rateLimit = await consumeToken(
    `wallet-recovery:${ip}:${email}`,
    WALLET_RECOVERY_LIMIT,
  );
  if (!rateLimit.ok) {
    return {
      error: `Too many recovery attempts. Try again in ${rateLimit.retryAfterSec} seconds.`,
    };
  }

  const rows = await db
    .select({
      code: orders.issuedCode,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      projectName: projects.name,
      allowedOrigins: projects.allowedOrigins,
      productName: products.name,
    })
    .from(orders)
    .innerJoin(projects, eq(orders.projectId, projects.id))
    .leftJoin(products, eq(orders.productIdSnapshot, products.id))
    .where(
      and(
        eq(orders.status, "paid"),
        isNotNull(orders.issuedCode),
        sql`lower(${orders.customerEmail}) = ${email}`,
      ),
    )
    .orderBy(desc(orders.paidAt), desc(orders.createdAt))
    .limit(20);

  const wallets = uniqueWallets(rows);
  const returnUrl = safeReturnUrl(
    parsed.data.returnUrl,
    wallets.map((w) => w.allowedOrigins),
  );
  if (wallets.length > 0) {
    try {
      await sendRecoveryEmail(email, wallets, returnUrl);
    } catch (error) {
      console.error("[vantezzen/pay] Failed to send wallet recovery email", error);
      return { error: "Could not send recovery email right now." };
    }
  }

  return {
    message: "If a paid wallet exists for that email, recovery details were sent.",
  };
}

function clientIpFromHeaders(headers: Pick<Headers, "get">): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function safeReturnUrl(
  value: string | undefined,
  allowedOriginSets: string[][],
): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const anyUnrestricted = allowedOriginSets.some((set) => set.length === 0);
  if (anyUnrestricted) return url.toString();
  const allowed = allowedOriginSets.flat();
  return allowed.includes(url.origin) ? url.toString() : null;
}

function uniqueWallets(
  rows: Array<{
    code: string | null;
    paidAt: Date | null;
    createdAt: Date;
    projectName: string;
    allowedOrigins: string[];
    productName: string | null;
  }>,
) {
  const byCode = new Map<string, (typeof rows)[number] & { code: string }>();
  for (const row of rows) {
    if (row.code && !byCode.has(row.code)) {
      byCode.set(row.code, { ...row, code: row.code });
    }
  }
  return [...byCode.values()];
}

async function sendRecoveryEmail(
  email: string,
  wallets: ReturnType<typeof uniqueWallets>,
  returnUrl: string | null,
) {
  const walletText = wallets
    .map((wallet, index) => {
      const transferUrl = returnUrl
        ? createWalletTransferUrl(returnUrl, wallet.code)
        : null;
      return [
        `${index + 1}. ${wallet.code}`,
        `   Project: ${wallet.projectName}`,
        wallet.productName ? `   Product: ${wallet.productName}` : null,
        `   Purchase: ${formatDate(wallet.paidAt ?? wallet.createdAt)}`,
        transferUrl ? `   Restore link: ${transferUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  await sendEmail({
    to: email,
    subject: "Your vantezzen/pay wallet recovery details",
    text: `We found paid wallets for this email.\n\n${walletText}\n\nOpen the wallet dialog in the app, paste a wallet code, or scan the QR code shown in this email.`,
    html: recoveryEmailHtml(wallets, returnUrl),
  });
}

function recoveryEmailHtml(
  wallets: ReturnType<typeof uniqueWallets>,
  returnUrl: string | null,
): string {
  const walletBlocks = wallets
    .map((wallet) => {
      const transferUrl = returnUrl
        ? createWalletTransferUrl(returnUrl, wallet.code)
        : null;
      const qrSvg = createQrSvg(wallet.code);

      return `
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:0 0 16px">
          <p style="margin:0 0 8px;color:#4b5563;font-size:14px">${escapeHtml(wallet.projectName)}${wallet.productName ? ` - ${escapeHtml(wallet.productName)}` : ""}</p>
          <p style="margin:0 0 12px;font-size:24px;font-weight:700;letter-spacing:0.08em">${escapeHtml(wallet.code)}</p>
          <p style="margin:0 0 12px;color:#4b5563;font-size:14px">Purchase: ${escapeHtml(formatDate(wallet.paidAt ?? wallet.createdAt))}</p>
          ${transferUrl ? `<p style="margin:0 0 12px"><a href="${escapeHtml(transferUrl)}">Open this wallet in the app</a></p>` : ""}
          ${qrSvg ? `<div>${qrSvg}</div>` : ""}
        </div>
      `;
    })
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h1 style="font-size:20px;margin:0 0 16px">Wallet recovery</h1>
      <p style="margin:0 0 20px">We found paid wallets for this email. Open the wallet dialog in the app, paste a wallet code, or scan a recovery QR code below.</p>
      ${walletBlocks}
      <p style="margin:16px 0 0;color:#4b5563;font-size:14px">If you did not request this, you can ignore this email.</p>
    </div>
  `;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
