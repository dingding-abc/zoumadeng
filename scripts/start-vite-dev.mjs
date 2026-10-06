import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const host = "127.0.0.1";
const port = 1421;
const devUrl = `http://${host}:${port}`;

async function canReuseServer() {
  try {
    const response = await fetch(devUrl, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

if (await canReuseServer()) {
  console.log(`Reusing existing Vite server at ${devUrl}`);
  process.exit(0);
}

const viteBin = resolve("node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteBin)) {
  throw new Error("Vite is not installed. Run npm install first.");
}

const vite = spawn(process.execPath, [viteBin, "--host", host], { stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => vite.kill(signal));
}

vite.on("exit", (code) => process.exit(code ?? 0));
