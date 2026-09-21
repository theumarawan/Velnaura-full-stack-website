import "dotenv/config";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";

const testFiles = readdirSync(new URL("../tests/", import.meta.url))
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => `tests/${name}`);

const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...testFiles], {
  env: { ...process.env, TEST_DATABASE_BACKEND: "postgres" },
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
