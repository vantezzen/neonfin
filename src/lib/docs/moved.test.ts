import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { movedDocs } from "./moved";

function pageExists(url: string): boolean {
  const path = url.replace(/^\/docs\/?/, "");
  const base = resolve(process.cwd(), "content/docs", path);
  return existsSync(`${base}.mdx`) || existsSync(resolve(base, "index.mdx"));
}

test("moved documentation links point to existing pages", () => {
  for (const target of movedDocs.values()) {
    expect(pageExists(target)).toBe(true);
  }
});
