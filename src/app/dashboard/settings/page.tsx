import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your dashboard account, sign-in methods, and deletion requests."
      />
      <SettingsForms
        user={{
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
        }}
      />
    </>
  );
}
