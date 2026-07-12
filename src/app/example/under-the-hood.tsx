import Link from "next/link";
import { codeToHtml } from "shiki";

// The real integration points from studio.tsx, trimmed to their essence.
const SNIPPETS = [
  {
    label: "Balance & wallet",
    code: `// app header
<RemainingCredits />
<WalletButton />`,
  },
  {
    label: "Metered usage",
    code: `const { deduct } = useCredits();

async function generate() {
  await deduct(1, {
    idempotencyKey: crypto.randomUUID(),
  });
  render();
}

<CreditGate cost={1}>
  <Button onClick={generate}>Generate</Button>
</CreditGate>`,
  },
  {
    label: "Gated access",
    code: `const pro = useFeature("pro");

<FeatureGate feature="commercial-license">
  <LicenseBadge />
</FeatureGate>`,
  },
];

async function Snippet({ label, code }: { label: string; code: string }) {
  "use cache";
  const html = await codeToHtml(code, {
    lang: "tsx",
    theme: "github-dark-default",
  });
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <div
        className="min-w-0 flex-1 overflow-hidden rounded-xl border [&_pre]:h-full [&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:text-xs [&_pre]:leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export function UnderTheHood() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          Under the hood
        </p>
        <h2 className="text-lg font-semibold tracking-tight">
          The entire billing layer on this page
        </h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {SNIPPETS.map((snippet) => (
          <Snippet key={snippet.label} {...snippet} />
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        No webhook handlers, no callback pages, no server code.{" "}
        <Link
          href="/docs/getting-started/quickstart"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Read the quickstart
        </Link>{" "}
        or{" "}
        <a
          href="https://github.com/vantezzen/pay/blob/main/src/app/example/studio.tsx"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline underline-offset-4"
        >
          view this page&apos;s source
        </a>
        .
      </p>
    </section>
  );
}
