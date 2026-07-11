import { CodeSnippet } from "@/components/app/copy";
import { SectionHeader } from "@/components/dashboard/page-header";

export function DevAiCoding({
  appUrl,
  publishableKey,
}: {
  appUrl: string;
  publishableKey: string | null;
}) {
  const prompt = [
    `Integrate vantezzen/pay into this app from start to finish. For that, please read the guide at https://pay.vantezzen.io/docs/agent.mdx`,
    `Use these environment variables in the app:`,
    `NEXT_PUBLIC_PAY_URL=${appUrl}`,
    `NEXT_PUBLIC_PAY_KEY=${publishableKey ?? "pay_pk_…  # create a publishable key above"}`,
  ].join("\n");

  return (
    <section className="flex flex-col gap-4">
      <SectionHeader
        title="Using an AI Agent?"
        description="If you're using an AI agent, you can use the following snippets to get started quickly."
      />
      <CodeSnippet code={prompt} />
    </section>
  );
}
