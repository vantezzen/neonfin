import { TriangleAlert } from "lucide-react";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/auth/dal";
import { listProviderAccounts } from "@/lib/queries/providers";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProviderAccountsSection } from "@/components/dashboard/provider-accounts-section";
import { ProviderConnectWizard } from "@/components/dashboard/provider-connect-wizard";

export const metadata = { title: "Providers" };

const NOTICE: Record<string, string> = {
  "account-in-use":
    "This provider account is attached to one or more products. Attach those products to another account (or delete them) first.",
};

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const accounts = await listProviderAccounts(user.id);
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  const { error } = await searchParams;
  const notice = error ? NOTICE[error] : undefined;

  return (
    <>
      <PageHeader
        title="Providers"
        description="Connect Stripe or Polar with restricted provider credentials. The provider service stores and uses keys outside the public web app."
        action={<ProviderConnectWizard appUrl={appUrl} />}
      />
      {notice ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}
      <ProviderAccountsSection accounts={accounts} appUrl={appUrl} />
    </>
  );
}
