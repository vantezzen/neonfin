export const siteName = "vantezzen/pay";
export const siteDescription =
  "Self-hosted credits, wallets, checkout, and shadcn payment components for small developer products.";

export function siteUrl(path = "/") {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
