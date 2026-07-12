import { encode } from "uqr";

export const WALLET_QUERY_PARAM = "__pay_wallet";

export type QrCode = {
  size: number;
  modules: boolean[][];
};

export function createWalletTransferUrl(
  currentUrl: string,
  code: string,
  param = WALLET_QUERY_PARAM,
): string {
  const next = new URL(currentUrl);
  const fragment = new URLSearchParams(next.hash.slice(1));
  fragment.set(param, code);
  next.hash = fragment.toString();
  return next.toString();
}

export function readWalletCode(
  value: string,
  param = WALLET_QUERY_PARAM,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const fragmentCode = new URLSearchParams(url.hash.slice(1)).get(param);
    return fragmentCode ?? url.searchParams.get(param) ?? trimmed;
  } catch {
    return trimmed;
  }
}

export function createQr(value: string): QrCode | null {
  if (!value) return null;
  try {
    const { size, data } = encode(value);
    return { size, modules: data.map((row) => [...row]) };
  } catch {
    return null;
  }
}
