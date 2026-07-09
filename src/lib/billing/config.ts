import "server-only";
import { env } from "@/lib/env";
import { BILLING_PLANS, type BillingPlan } from "./plans";

export type BillingMode = "self_hosted" | "hosted";

export type BillingUser = {
  id: string;
  email: string;
};

export type HostedPayConfig =
  | {
      enabled: false;
      mode: "self_hosted";
      publicBaseUrl: null;
      publishableKey: null;
      secretKey: null;
    }
  | {
      enabled: true;
      mode: "hosted";
      publicBaseUrl: string;
      publishableKey: string;
      secretKey: string;
    };

function csvSet(
  value: string | undefined,
  normalize: (item: string) => string = (item) => item,
): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(normalize),
  );
}

export function hostedPayConfig(): HostedPayConfig {
  const config = env();
  if (config.PAY_BILLING_MODE !== "hosted") {
    return {
      enabled: false,
      mode: "self_hosted",
      publicBaseUrl: null,
      publishableKey: null,
      secretKey: null,
    };
  }

  if (!config.NEXT_PUBLIC_HOSTED_PAY_KEY || !config.PAY_HOSTED_PAY_SECRET_KEY) {
    throw new Error(
      "PAY_BILLING_MODE=hosted requires NEXT_PUBLIC_HOSTED_PAY_KEY and PAY_HOSTED_PAY_SECRET_KEY",
    );
  }

  return {
    enabled: true,
    mode: "hosted",
    publicBaseUrl:
      config.NEXT_PUBLIC_HOSTED_PAY_URL ?? config.NEXT_PUBLIC_APP_URL,
    publishableKey: config.NEXT_PUBLIC_HOSTED_PAY_KEY,
    secretKey: config.PAY_HOSTED_PAY_SECRET_KEY,
  };
}

export function hasAllAccess(user: BillingUser): boolean {
  const config = env();
  const ids = csvSet(config.PAY_ALL_ACCESS_USER_IDS);
  const emails = csvSet(config.PAY_ALL_ACCESS_EMAILS, (email) =>
    email.toLowerCase(),
  );
  return ids.has(user.id) || emails.has(user.email.toLowerCase());
}

export function defaultPlanForMode(mode: BillingMode): BillingPlan {
  return mode === "hosted" ? BILLING_PLANS.free : BILLING_PLANS.all_access;
}

export function planForUser(user: BillingUser): BillingPlan {
  const config = hostedPayConfig();
  if (!config.enabled || hasAllAccess(user)) return BILLING_PLANS.all_access;
  return BILLING_PLANS.free;
}
