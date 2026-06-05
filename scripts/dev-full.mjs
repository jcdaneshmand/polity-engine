import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_SERVER_PORT = "8000";
const DEFAULT_APP_PORT = "5173";

function npmCommand() {
  return "npm";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildChildEnv(baseEnv = process.env, overrides = {}) {
  const childEnv = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (process.platform === "win32" && key !== "Path" && key.toLowerCase() === "path") continue;
    childEnv[key] = value;
  }
  return { ...childEnv, ...overrides };
}

export async function waitForHTTP(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 500;
  const fetcher = options.fetcher ?? fetch;
  const wait = options.sleep ?? sleep;
  const now = options.now ?? Date.now;
  const startedAt = now();
  let lastStatus = "unreachable";

  while (now() - startedAt < timeoutMs) {
    try {
      const response = await fetcher(url);
      lastStatus = String(response.status);
      if (response.ok) return;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : "unreachable";
    }
    await wait(intervalMs);
  }

  throw new Error(`Timed out waiting for ${url} (${lastStatus})`);
}

export function createDevFullController(options = {}) {
  const command = options.command ?? npmCommand();
  const spawnProcess = options.spawnProcess ?? ((name, args, spawnOptions) => {
    if (process.platform === "win32") {
      return spawn(`${command} ${args.join(" ")}`, [], { ...spawnOptions, shell: true });
    }
    return spawn(command, args, spawnOptions);
  });
  const children = [];
  let stopping = false;

  function stopAll(signal = "SIGTERM") {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (!child.killed) child.kill(signal);
    }
  }

  function start(name, args, env) {
    const child = spawnProcess(name, args, {
      cwd: options.cwd ?? process.cwd(),
      env: buildChildEnv(process.env, env),
      shell: false,
      stdio: "inherit"
    });
    children.push(child);
    child.once?.("exit", () => stopAll("SIGTERM"));
    child.once?.("error", () => stopAll("SIGTERM"));
    return child;
  }

  return {
    startServer() {
      return start("server", ["run", "server:dev"], {
        POLITY_SERVER_PORT: options.serverPort ?? DEFAULT_SERVER_PORT
      });
    },
    startApp() {
      const serverPort = options.serverPort ?? DEFAULT_SERVER_PORT;
      return start("app", ["run", "dev", "-w", "app", "--", "--host", "127.0.0.1", "--port", options.appPort ?? DEFAULT_APP_PORT], {
        VITE_MULTIPLAYER_DEV_PROXY_TARGET: `http://127.0.0.1:${serverPort}`
      });
    },
    stopAll
  };
}

export async function ensureServerReady(controller, serverURL, options = {}) {
  const healthURL = `${serverURL}/polity/lobby/rooms`;
  const wait = options.waitForHTTP ?? waitForHTTP;
  try {
    await wait(healthURL, { timeoutMs: options.reuseTimeoutMs ?? 1_000 });
    return "reused";
  } catch {
    controller.startServer();
    await wait(healthURL, { timeoutMs: options.startTimeoutMs ?? 30_000 });
    return "started";
  }
}

async function main() {
  const serverPort = process.env.POLITY_SERVER_PORT || DEFAULT_SERVER_PORT;
  const appPort = process.env.VITE_APP_PORT || DEFAULT_APP_PORT;
  const serverURL = `http://127.0.0.1:${serverPort}`;
  const controller = createDevFullController({ serverPort, appPort });
  let stopping = false;

  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    controller.stopAll(signal);
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("exit", () => controller.stopAll("SIGTERM"));

  console.log(`Checking multiplayer server on ${serverURL}`);
  const serverMode = await ensureServerReady(controller, serverURL);
  console.log(serverMode === "reused" ? `Using existing multiplayer server on ${serverURL}` : `Started multiplayer server on ${serverURL}`);

  console.log(`Starting app on http://127.0.0.1:${appPort}`);
  controller.startApp();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
