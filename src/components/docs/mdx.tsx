import defaultMdxComponents from "fumadocs-ui/mdx";
import { Step, Steps } from "fumadocs-ui/components/steps";
import {
  CreditGateLiveDemo,
  FeatureGateLiveDemo,
  ProviderLiveDemo,
  PurchaseLiveDemo,
  RemainingCreditsLiveDemo,
  UseCreditsLiveDemo,
  WalletLiveDemo,
} from "@/components/docs/pay-component-demos";
import type { MDXComponents } from "mdx/types";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Step,
    Steps,
    CreditGateLiveDemo,
    FeatureGateLiveDemo,
    ProviderLiveDemo,
    PurchaseLiveDemo,
    RemainingCreditsLiveDemo,
    UseCreditsLiveDemo,
    WalletLiveDemo,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
