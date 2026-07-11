import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const STUBS = `
declare module "@/components/pay/provider" {
  export const PayProvider: import("react").ComponentType<{
    baseUrl: string;
    publishableKey: string;
    children?: import("react").ReactNode;
  }>;
  export function useCredits(): {
    loading: boolean;
    deduct(amount: number, input?: { idempotencyKey?: string; meta?: Record<string, unknown> }): Promise<void>;
  };
}

declare module "@/components/pay/credit-gate" {
  export const CreditGate: import("react").ComponentType<{
    cost: number;
    fallback?: import("react").ReactNode;
    children?: import("react").ReactNode;
  }>;
}

declare module "@/components/pay/purchase-dialog" {
  export const PurchaseButton: import("react").ComponentType<{ children?: import("react").ReactNode }>;
}

declare module "@/components/ui/button" {
  export const Button: import("react").ComponentType<import("react").ButtonHTMLAttributes<HTMLButtonElement>>;
}

declare module "@/lib/pay/server" {
  export class PayError extends Error {
    isInsufficientCredits: boolean;
  }
  export function createPayServerClient(config: {
    baseUrl: string;
    secretKey: string;
  }): {
    deduct(input: {
      externalUserId: string;
      amount: number;
      idempotencyKey: string;
    }): Promise<void>;
    createCheckout(priceId: string, input: {
      externalUserId: string;
      successUrl?: string;
    }): Promise<{ url: string }>;
    hasFeature(externalUserId: string, feature: string): Promise<boolean>;
  };
}
`;

type Snippet = { title: string; code: string };

function agentSnippets(): Snippet[] {
  const source = readFileSync(
    resolve(process.cwd(), "content/docs/agent.mdx"),
    "utf8",
  );
  const snippets: Snippet[] = [];
  const blocks = /```(?:ts|tsx) title="([^"]+)"\n([\s\S]*?)^```/gm;
  for (const match of source.matchAll(blocks)) {
    if (
      match[1] === "app/layout.tsx" ||
      match[1] === "components/paid-action.tsx" ||
      match[1] === "app/api/run-paid-work/route.ts"
    ) {
      snippets.push({ title: match[1], code: match[2] });
    }
  }
  return snippets;
}

function diagnosticsFor(snippet: Snippet, index: number): string[] {
  const fileName = resolve(process.cwd(), `.docs-typecheck/agent-${index}.tsx`);
  const typesName = resolve(process.cwd(), ".docs-typecheck/pay-docs.d.ts");
  const options: ts.CompilerOptions = {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
  };
  const files = new Map([
    [fileName, `import type * as React from "react";\n${snippet.code}`],
    [typesName, STUBS],
  ]);
  const base = ts.createCompilerHost(options, true);
  const host: ts.CompilerHost = {
    ...base,
    fileExists: (name) => files.has(name) || base.fileExists(name),
    readFile: (name) => files.get(name) ?? base.readFile(name),
    getSourceFile: (name, languageVersion) => {
      const source = files.get(name);
      return source === undefined
        ? base.getSourceFile(name, languageVersion)
        : ts.createSourceFile(name, source, languageVersion, true);
    },
  };
  const program = ts.createProgram([fileName, typesName], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === fileName)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}

test("agent guide standalone code samples typecheck", () => {
  const snippets = agentSnippets();
  expect(snippets.length).toBe(5);
  for (const [index, snippet] of snippets.entries()) {
    const diagnostics = diagnosticsFor(snippet, index);
    if (diagnostics.length > 0) {
      throw new Error(`${snippet.title}:\n${diagnostics.join("\n")}`);
    }
  }
});
