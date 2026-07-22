import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function buildLocalHostedSmokeConfig(env = process.env) {
  const port = Number(env.POLITY_LOCAL_HOSTED_SMOKE_PORT ?? "8794");
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("POLITY_LOCAL_HOSTED_SMOKE_PORT must be a positive integer.");
  }
  return {
    port,
    baseURL: `http://127.0.0.1:${port}`,
    storagePath: env.POLITY_LOCAL_HOSTED_SMOKE_STORAGE_PATH
      ?? resolve("tmp", "local-hosted-smoke", `storage-${Date.now()}`)
  };
}

function childEnv(config, overrides = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (process.platform === "win32" && key !== "Path" && key.toLowerCase() === "path") continue;
    env[key] = value;
  }
  const expectedCommit = env.POLITY_EXPECTED_COMMIT?.trim();
  return {
    ...env,
    POLITY_SERVER_PORT: String(config.port),
    POLITY_STORAGE_PATH: config.storagePath,
    ...(expectedCommit && !env.POLITY_BUILD_COMMIT ? { POLITY_BUILD_COMMIT: expectedCommit } : {}),
    VITE_SHOW_PRIVATE_CARD_DEBUG: "false",
    ...overrides
  };
}

function serverCommand() {
  return process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", `${npmCommand()} run server:dev`] }
    : { command: npmCommand(), args: ["run", "server:dev"] };
}

function spawnServer(config) {
  const command = serverCommand();
  const child = spawn(command.command, command.args, {
    cwd: process.cwd(),
    env: childEnv(config),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => logs.push(chunk));
  child.stderr.on("data", (chunk) => logs.push(chunk));
  return { child, logs, port: config.port };
}

async function waitForHTTP(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  let lastError = "unreachable";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      lastError = `${response.status} ${response.statusText}`;
      if (response.ok) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function listenerPidForPort(port) {
  if (process.platform !== "win32") return undefined;
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  const listenLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.includes(`:${port}`) && line.includes("LISTENING"));
  const pid = listenLine?.trim().split(/\s+/).at(-1);
  return pid && /^\d+$/.test(pid) ? pid : undefined;
}

function stopWindowsPid(pid) {
  spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`
  ], { stdio: "ignore" });
}

async function stopServer(running) {
  if (!running?.child || running.child.killed) return;
  const waitForExit = new Promise((resolveWait) => {
    const timeout = setTimeout(resolveWait, 5_000);
    running.child.once("exit", () => {
      clearTimeout(timeout);
      resolveWait();
    });
    running.child.once("close", () => {
      clearTimeout(timeout);
      resolveWait();
    });
  });
  if (process.platform === "win32") {
    running.child.kill();
    const listenerPid = listenerPidForPort(running.port);
    if (listenerPid) stopWindowsPid(listenerPid);
    await waitForExit;
    running.child.stdout.destroy();
    running.child.stderr.destroy();
    return;
  }
  running.child.kill("SIGTERM");
  await waitForExit;
}

function runHostedSmoke(config) {
  const command = process.platform === "win32" ? "cmd.exe" : npmCommand();
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `${npmCommand()} run smoke:hosted`]
    : ["run", "smoke:hosted"];
  return spawnSync(command, args, {
    cwd: process.cwd(),
    env: childEnv(config, { POLITY_HOSTED_BASE_URL: config.baseURL }),
    shell: false,
    stdio: "inherit"
  });
}

function logTail(running) {
  return running?.logs?.join("").split(/\r?\n/).slice(-40).join("\n") ?? "";
}

export async function runLocalHostedSmoke(config = buildLocalHostedSmokeConfig()) {
  await mkdir(config.storagePath, { recursive: true });
  const running = spawnServer(config);
  try {
    await waitForHTTP(`${config.baseURL}/polity/accounts/health`);
    await waitForHTTP(config.baseURL);
    const result = runHostedSmoke(config);
    if (result.status !== 0) {
      throw new Error(`Local hosted smoke failed with exit code ${result.status ?? "unknown"}.`);
    }
    return { ok: true, smoke: "local-hosted", baseURL: config.baseURL };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const tail = logTail(running);
    throw new Error(tail ? `${message}\n\nServer log tail:\n${tail}` : message);
  } finally {
    await stopServer(running);
    if (!process.env.POLITY_LOCAL_HOSTED_SMOKE_KEEP_STORAGE) {
      await rm(config.storagePath, { recursive: true, force: true });
    }
  }
}

async function main() {
  const result = await runLocalHostedSmoke();
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => {
      process.exitCode = 0;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  );
}
