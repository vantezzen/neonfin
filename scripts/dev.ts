import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const providerDir = join(root, "services/provider");

if (!existsSync(join(providerDir, "node_modules"))) {
  console.warn(
    "[dev] services/provider/node_modules is missing. Run `bun install` in services/provider before using the provider service.",
  );
}

const children: ChildProcess[] = [
  spawn("bun", ["run", "dev:web"], { cwd: root, stdio: "inherit" }),
  spawn("bun", ["run", "--cwd", providerDir, "dev"], {
    cwd: root,
    stdio: "inherit",
  }),
];

let shuttingDown = false;

function stop(code: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = code;
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[dev] child process exited (${signal ?? code ?? 0})`);
    stop(code ?? 1);
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
