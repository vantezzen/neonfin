import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { CodeSnippet } from "@/components/app/copy";
import { SectionHeader } from "@/components/dashboard/page-header";

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
          {n}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:pl-[30px]">{children}</div>
    </li>
  );
}

/**
 * Copy-paste onboarding for this specific project: real registry URLs and the
 * project's actual publishable key baked into every snippet, so going from
 * dashboard to working app is three pastes.
 */
export function DevQuickstart({
  appUrl,
  publishableKey,
}: {
  appUrl: string;
  publishableKey: string | null;
}) {
  const install = [
    `npx shadcn@latest add ${appUrl}/r/neonfin-provider.json \\`,
    `  ${appUrl}/r/neonfin-credits.json \\`,
    `  ${appUrl}/r/neonfin-purchase.json \\`,
    `  ${appUrl}/r/neonfin-gate.json`,
  ].join("\n");

  const envVars = [
    `NEXT_PUBLIC_NEONFIN_URL=${appUrl}`,
    `NEXT_PUBLIC_NEONFIN_KEY=${publishableKey ?? "nf_pk_…  # create a publishable key above"}`,
  ].join("\n");

  const provider = [
    `import { NeonfinProvider } from "@/components/neonfin/provider";`,
    ``,
    `<NeonfinProvider`,
    `  baseUrl={process.env.NEXT_PUBLIC_NEONFIN_URL!}`,
    `  publishableKey={process.env.NEXT_PUBLIC_NEONFIN_KEY!}`,
    `>`,
    `  {children}`,
    `</NeonfinProvider>`,
  ].join("\n");

  const usage = [
    `import { useCredits } from "@/components/neonfin/provider";`,
    ``,
    `const { deduct } = useCredits();`,
    `await deduct(1); // spend one credit - wallet handled automatically`,
  ].join("\n");

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader
        title="Quick start"
        description="Wire this project into your app - snippets already include your key."
        action={
          <a
            href="/docs/getting-started"
            target="_blank"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Full guide
            <ArrowUpRight className="size-3.5" />
          </a>
        }
      />
      <ol className="flex flex-col gap-5">
        <Step n={1} title="Install the components">
          <CodeSnippet code={install} />
        </Step>
        <Step n={2} title="Add your environment variables">
          <CodeSnippet code={envVars} />
        </Step>
        <Step n={3} title="Wrap your app, then spend credits">
          <CodeSnippet code={provider} />
          <CodeSnippet code={usage} />
        </Step>
      </ol>
    </section>
  );
}
