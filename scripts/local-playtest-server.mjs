import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function resolveLocalPlaytestOptions(env = process.env) {
  const port = Number(env.POLITY_PLAYTEST_PORT ?? "8785");
  if (!Number.isInteger(port) || port <= 0) throw new Error("POLITY_PLAYTEST_PORT must be a positive integer.");
  return {
    host: "127.0.0.1",
    port,
    storagePath: env.POLITY_PLAYTEST_STORAGE_PATH ?? resolve("tmp", "local-playtest", `storage-${Date.now()}`)
  };
}

export function buildLocalPlaytestEnv(options, baseEnv = process.env) {
  const childEnv = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (process.platform === "win32" && key !== "Path" && key.toLowerCase() === "path") continue;
    childEnv[key] = value;
  }
  return {
    ...childEnv,
    POLITY_SERVER_PORT: String(options.port),
    POLITY_STORAGE_PATH: options.storagePath,
    VITE_SHOW_PRIVATE_CARD_DEBUG: "false"
  };
}

export function formatPlaytestBanner(options) {
  const baseURL = `http://${options.host}:${options.port}`;
  return [
    "Polity local playtest server",
    `App: ${baseURL}`,
    `Health: ${baseURL}/polity/accounts/health`,
    `Lobby rooms: ${baseURL}/polity/lobby/rooms`,
    `Storage: ${options.storagePath}`,
    "Use Ctrl+C to stop the server."
  ].join("\n");
}

function serverCommand() {
  return process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", `${npmCommand()} run server:dev`] }
    : { command: npmCommand(), args: ["run", "server:dev"] };
}

export function startLocalPlaytestServer(options = resolveLocalPlaytestOptions()) {
  mkdirSync(options.storagePath, { recursive: true });
  const server = serverCommand();
  return spawn(server.command, server.args, {
    cwd: process.cwd(),
    env: buildLocalPlaytestEnv(options),
    shell: false,
    stdio: "inherit"
  });
}

async function main() {
  const options = resolveLocalPlaytestOptions();
  console.log(formatPlaytestBanner(options));
  const child = startLocalPlaytestServer(options);
  const stop = () => {
    if (child.killed) return;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      return;
    }
    child.kill("SIGTERM");
  };
  process.on("SIGINT", () => { stop(); process.exit(130); });
  process.on("SIGTERM", () => { stop(); process.exit(143); });
  child.once("exit", (code) => { process.exitCode = code ?? 0; });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
