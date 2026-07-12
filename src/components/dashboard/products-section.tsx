"use client";
import { Package } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { SectionHeader } from "@/components/dashboard/page-header";
import {
  knownFeaturesOf,
  productPriceNoun,
  type ProductWithPrices,
  type ProviderOption,
} from "./products/meta";
import { ProductCard } from "./products/product-card";
import {
  NewProductButton,
} from "./products/new-product-button";
import { AddPriceButton } from "./products/price-buttons";

export type { ProductWithPrices, ProviderOption };
export { productPriceNoun, knownFeaturesOf, NewProductButton, AddPriceButton };

export function ProductsSection({
  projectId,
  products,
  providerAccounts,
}: {
  projectId: string;
  products: ProductWithPrices[];
  providerAccounts: ProviderOption[];
}) {
  const knownFeatures = knownFeaturesOf(products);
  return (
    <div className="flex flex-col gap-4">
      {products.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="No products yet"
          description="Sell credits, a subscription, or a one-time unlock - pick a shape and vantezzen/pay handles the rest."
          action={
            <NewProductButton
              projectId={projectId}
              providerAccounts={providerAccounts}
            />
          }
        />
      ) : (
        <>
          <SectionHeader
            title="Products"
            description="Credit packs, subscriptions, and one-time unlocks - each with its own prices."
            action={
              <NewProductButton
                projectId={projectId}
                providerAccounts={providerAccounts}
              />
            }
          />
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              projectId={projectId}
              providerAccounts={providerAccounts}
              knownFeatures={knownFeatures}
            />
          ))}
        </>
      )}
    </div>
  );
}
