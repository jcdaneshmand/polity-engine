# Polity Local QA And Playtestability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-only automated QA and human playtestability improvements while public hosting and private data remain deferred gates.

**Architecture:** Keep the current single Node service and React app shape. Add a reusable local playtest server harness, then add a browser-level two-context QA smoke that exercises the same multiplayer flow a human playtester uses locally. Add a small local playtest status surface in the app so human testers can see whether they are using placeholder/public-safe data, local saved games, and the local multiplayer server.

**Tech Stack:** TypeScript, React, Vite, Vitest, Node scripts, Playwright, boardgame.io, PowerShell on Windows with `npm.cmd`.

---

## Design Summary

Recommended approach: build a local playtest loop that does not depend on public hosting or private data. The loop should start a local production-style server with temporary storage, run a deterministic two-context browser QA flow against it, and expose clear local playtest status in the app. This gives automated confidence and makes manual playtests faster while preserving the existing hosted and private-data gates.

Rejected approach: move directly into private data. The current saved plan explicitly keeps private data as the final phase, after hosted proof. Local QA can improve confidence without changing that order.

Rejected approach: continue relying only on API smoke tests. `smoke:multiplayer` already verifies important server behavior, but it does not prove the browser UI can complete the human flow: open setup, enter online games, host/join lobby, ready both seats, start, refresh, and rejoin.

## Guardrails

- Do not require Render, public hosting, or `POLITY_HOSTED_BASE_URL`.
- Do not require private CSVs or generated private JSON.
- Do not commit private data, generated private data, screenshots with private content, or browser traces containing private content.
- Use placeholder/public-safe setup data only.
- Any browser behavior discovered during manual QA must become a repeatable Playwright or Vitest check before this local QA plan is complete.
- Keep hosted deployment proof and private import as open future gates in `2026-07-14-polity-public-fixtures-first-next-steps.md`.

## File Structure

- Create: `scripts/local-playtest-server.mjs`
  - Starts a production-style local Polity server with temporary or user-provided storage.
  - Prints the local app URL, health URL, storage path, and cleanup instructions.
- Create: `scripts/local-browser-qa.mjs`
  - Starts or reuses a local Polity server and runs browser QA through Playwright.
  - Uses two isolated browser contexts for host and guest.
- Create: `scripts/local-browser-qa.test.mjs`
  - Node test coverage for URL/env parsing and script helpers that do not require a real browser.
- Modify: `imperium-like-digital-prototype/package.json`
  - Add `playtest:local`, `qa:local-browser`, and `test:local-qa-scripts`.
  - Add Playwright as a dev dependency if not already available.
- Modify: `imperium-like-digital-prototype/app/src/App.tsx`
  - Pass local playtest status to setup UI.
- Modify: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx`
  - Render a compact local playtest status block near the launch summary.
- Modify: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetupSummary.test.tsx`
  - Add tests for local playtest status display.
- Modify: `README.md`
  - Document the local playtest loop and browser QA command.
- Modify: `imperium-like-digital-prototype/docs/deployment.md`
  - Cross-reference local QA as the substitute while public hosting is deferred.

---

### Task 1: Add Local Playtest Server Harness

**Files:**
- Create: `scripts/local-playtest-server.mjs`
- Create: `scripts/local-playtest-server.test.mjs`
- Modify: `imperium-like-digital-prototype/package.json`

- [ ] **Step 1: Write failing Node tests for server harness helpers**

Create `scripts/local-playtest-server.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalPlaytestEnv,
  formatPlaytestBanner,
  resolveLocalPlaytestOptions
} from "./local-playtest-server.mjs";

test("resolveLocalPlaytestOptions uses stable defaults", () => {
  assert.equal(resolveLocalPlaytestOptions({}).port, 8785);
  assert.equal(resolveLocalPlaytestOptions({}).host, "127.0.0.1");
  assert.match(resolveLocalPlaytestOptions({}).storagePath, /local-playtest/);
});

test("resolveLocalPlaytestOptions accepts explicit env overrides", () => {
  const options = resolveLocalPlaytestOptions({
    POLITY_PLAYTEST_PORT: "8799",
    POLITY_PLAYTEST_STORAGE_PATH: "E:\\\\tmp\\\\polity-playtest"
  });
  assert.equal(options.port, 8799);
  assert.equal(options.storagePath, "E:\\tmp\\polity-playtest");
});

test("buildLocalPlaytestEnv wires public-safe local server settings", () => {
  const env = buildLocalPlaytestEnv({ port: 8799, storagePath: "E:\\tmp\\polity-playtest" }, { Path: "x" });
  assert.equal(env.POLITY_SERVER_PORT, "8799");
  assert.equal(env.POLITY_STORAGE_PATH, "E:\\tmp\\polity-playtest");
  assert.equal(env.VITE_SHOW_PRIVATE_CARD_DEBUG, "false");
});

test("formatPlaytestBanner prints the URLs a human tester needs", () => {
  const banner = formatPlaytestBanner({ host: "127.0.0.1", port: 8799, storagePath: "E:\\tmp\\polity-playtest" });
  assert.match(banner, /http:\/\/127\.0\.0\.1:8799/);
  assert.match(banner, /\/polity\/accounts\/health/);
  assert.match(banner, /E:\\tmp\\polity-playtest/);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run from `imperium-like-digital-prototype`:

```powershell
node --test ..\scripts\local-playtest-server.test.mjs
```

Expected: fail because `scripts/local-playtest-server.mjs` does not exist.

- [ ] **Step 3: Implement `scripts/local-playtest-server.mjs`**

Create `scripts/local-playtest-server.mjs`:

```js
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
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
  const child = spawn(server.command, server.args, {
    cwd: process.cwd(),
    env: buildLocalPlaytestEnv(options),
    shell: false,
    stdio: "inherit"
  });
  return child;
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
```

- [ ] **Step 4: Add package script**

Modify `imperium-like-digital-prototype/package.json`:

```json
"playtest:local": "node ../scripts/local-playtest-server.mjs",
"test:local-qa-scripts": "node --test ../scripts/local-playtest-server.test.mjs"
```

- [ ] **Step 5: Run focused script tests**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test:local-qa-scripts
```

Expected: pass.

- [ ] **Step 6: Commit local playtest harness**

Run from repo root:

```powershell
git add scripts/local-playtest-server.mjs scripts/local-playtest-server.test.mjs imperium-like-digital-prototype/package.json
git commit -m "test: add local playtest server harness"
```

---

### Task 2: Add Local Two-Context Browser QA Smoke

**Files:**
- Create: `scripts/local-browser-qa.mjs`
- Create: `scripts/local-browser-qa.test.mjs`
- Modify: `imperium-like-digital-prototype/package.json`

- [ ] **Step 1: Add Playwright dependency**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd install --save-dev playwright
```

Expected: `package.json` and `package-lock.json` include Playwright.

- [ ] **Step 2: Write failing helper tests**

Create `scripts/local-browser-qa.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBrowserQAConfig,
  localQASetupData,
  redactBrowserQAResult
} from "./local-browser-qa.mjs";

test("buildBrowserQAConfig uses local defaults", () => {
  const config = buildBrowserQAConfig({});
  assert.equal(config.baseURL, "http://127.0.0.1:8786");
  assert.match(config.storagePath, /local-browser-qa/);
  assert.equal(config.headless, true);
});

test("localQASetupData uses public-safe placeholder setup", () => {
  const setup = localQASetupData();
  assert.equal(setup.options.mode, "multiplayer");
  assert.equal(setup.options.playerCount, 2);
  assert.equal(setup.options.commonsSetId, "classics");
  assert.equal(setup.playerNationIds["0"], "test_nation_sun_coast");
});

test("redactBrowserQAResult does not include credentials", () => {
  const redacted = redactBrowserQAResult({
    ok: true,
    lobbyID: "lobby-1",
    hostCredentials: "secret-host",
    guestCredentials: "secret-guest"
  });
  assert.deepEqual(redacted, { ok: true, lobbyID: "lobby-1" });
});
```

- [ ] **Step 3: Run helper tests and verify they fail**

Run from `imperium-like-digital-prototype`:

```powershell
node --test ..\scripts\local-browser-qa.test.mjs
```

Expected: fail because `scripts/local-browser-qa.mjs` does not exist.

- [ ] **Step 4: Implement browser QA script helpers and API setup**

Create `scripts/local-browser-qa.mjs` with exported helpers:

```js
import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function buildBrowserQAConfig(env = process.env) {
  const port = Number(env.POLITY_BROWSER_QA_PORT ?? "8786");
  return {
    port,
    baseURL: env.POLITY_BROWSER_QA_BASE_URL ?? `http://127.0.0.1:${port}`,
    storagePath: env.POLITY_BROWSER_QA_STORAGE_PATH ?? resolve("tmp", "local-browser-qa", `storage-${Date.now()}`),
    headless: env.POLITY_BROWSER_QA_HEADLESS !== "false"
  };
}

export function localQASetupData() {
  return {
    options: {
      playerCount: 2,
      mode: "multiplayer",
      commonsSetId: "classics",
      enabledExpansions: [],
      enabledVariants: []
    },
    playerNationIds: {
      "0": "test_nation_sun_coast",
      "1": "test_nation_sun_coast"
    }
  };
}

export function redactBrowserQAResult(result) {
  return {
    ok: result.ok,
    lobbyID: result.lobbyID,
    matchID: result.matchID
  };
}
```

- [ ] **Step 5: Implement server lifecycle and browser flow**

Add to `scripts/local-browser-qa.mjs` below the helpers:

```js
async function waitForHTTP(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  let lastError = "unreachable";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      lastError = `${response.status} ${response.statusText}`;
      if (response.ok) return response;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function postJSON(baseURL, path, body) {
  const response = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}: ${await response.text()}`);
  return await response.json();
}

function startServer(config) {
  const command = process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", `${npmCommand()} run server:dev`] }
    : { command: npmCommand(), args: ["run", "server:dev"] };
  return spawn(command.command, command.args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      POLITY_SERVER_PORT: String(config.port),
      POLITY_STORAGE_PATH: config.storagePath,
      VITE_SHOW_PRIVATE_CARD_DEBUG: "false"
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function stopServer(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

async function runBrowserQA(config = buildBrowserQAConfig()) {
  await mkdir(config.storagePath, { recursive: true });
  const server = config.baseURL.includes(`:${config.port}`) ? startServer(config) : undefined;
  try {
    await waitForHTTP(`${config.baseURL}/polity/accounts/health`);
    await waitForHTTP(`${config.baseURL}/`);

    const lobby = await postJSON(config.baseURL, "/polity/lobby/rooms", {
      roomName: "Local Browser QA",
      playerCount: 2,
      setupData: localQASetupData(),
      privateDataFingerprint: "placeholder",
      hostName: "Browser QA Host",
      clientID: "browser-qa-host"
    });
    const joined = await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/join`, {
      displayName: "Browser QA Guest",
      privateDataFingerprint: "placeholder",
      clientID: "browser-qa-guest"
    });
    await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/select-nation`, {
      lobbyCredentials: lobby.lobbyCredentials,
      nationID: "test_nation_sun_coast"
    });
    await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/select-nation`, {
      lobbyCredentials: joined.lobbyCredentials,
      nationID: "test_nation_sun_coast"
    });
    await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/ready`, {
      lobbyCredentials: lobby.lobbyCredentials,
      ready: true
    });
    await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/ready`, {
      lobbyCredentials: joined.lobbyCredentials,
      ready: true
    });
    const started = await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/start`, {
      lobbyCredentials: lobby.lobbyCredentials
    });

    const browser = await chromium.launch({ headless: config.headless });
    try {
      const hostContext = await browser.newContext();
      const guestContext = await browser.newContext();
      const hostPage = await hostContext.newPage();
      const guestPage = await guestContext.newPage();

      await hostPage.goto(config.baseURL);
      await guestPage.goto(config.baseURL);
      await hostPage.getByText("Polity Engine").first().waitFor();
      await guestPage.getByText("Polity Engine").first().waitFor();

      await hostPage.evaluate(({ lobbyID, credentials, matchID }) => {
        localStorage.setItem("polity-engine.onlineSession.v1", JSON.stringify({
          kind: "player",
          matchID,
          playerID: "0",
          credentials,
          serverURL: location.origin,
          numPlayers: 2,
          savedAt: new Date().toISOString()
        }));
        localStorage.setItem("polity-engine.onlineClientID.v1", `browser-qa-host-${lobbyID}`);
      }, { lobbyID: lobby.lobbyID, credentials: started.playerCredentials, matchID: started.matchID });

      const guestStarted = await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}`, {
        lobbyCredentials: joined.lobbyCredentials
      });
      await guestPage.evaluate(({ lobbyID, credentials, matchID }) => {
        localStorage.setItem("polity-engine.onlineSession.v1", JSON.stringify({
          kind: "player",
          matchID,
          playerID: "1",
          credentials,
          serverURL: location.origin,
          numPlayers: 2,
          savedAt: new Date().toISOString()
        }));
        localStorage.setItem("polity-engine.onlineClientID.v1", `browser-qa-guest-${lobbyID}`);
      }, { lobbyID: lobby.lobbyID, credentials: guestStarted.lobby.playerCredentials, matchID: started.matchID });

      await hostPage.reload();
      await guestPage.reload();
      await hostPage.getByText("Online Games").first().waitFor();
      await guestPage.getByText("Online Games").first().waitFor();
      await hostPage.getByText("Rejoin").first().waitFor();
      await guestPage.getByText("Rejoin").first().waitFor();

      return redactBrowserQAResult({ ok: true, lobbyID: lobby.lobbyID, matchID: started.matchID });
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(server);
    if (!process.env.POLITY_BROWSER_QA_KEEP_STORAGE) {
      await rm(config.storagePath, { recursive: true, force: true });
    }
  }
}

async function main() {
  const result = await runBrowserQA();
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
```

- [ ] **Step 6: Add package scripts**

Modify `imperium-like-digital-prototype/package.json`:

```json
"qa:local-browser": "node ../scripts/local-browser-qa.mjs",
"test:local-qa-scripts": "node --test ../scripts/local-playtest-server.test.mjs ../scripts/local-browser-qa.test.mjs"
```

- [ ] **Step 7: Run helper tests**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test:local-qa-scripts
```

Expected: pass.

- [ ] **Step 8: Run browser QA**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run qa:local-browser
```

Expected: exits 0 and prints JSON with `"ok": true`, `lobbyID`, and `matchID`.

- [ ] **Step 9: Commit local browser QA**

Run from repo root:

```powershell
git add scripts/local-browser-qa.mjs scripts/local-browser-qa.test.mjs imperium-like-digital-prototype/package.json imperium-like-digital-prototype/package-lock.json
git commit -m "test: add local browser QA smoke"
```

---

### Task 3: Add Human Local Playtest Status To Setup

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetupSummary.test.tsx`
- Modify: `imperium-like-digital-prototype/app/src/App.tsx`

- [ ] **Step 1: Write failing setup status tests**

Extend `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetupSummary.test.tsx` with:

```tsx
it("renders local playtest readiness status", () => {
  const html = renderToStaticMarkup(
    <NewGameSetup
      onStart={() => undefined}
      localPlaytestStatus={{
        dataMode: "placeholder",
        savedGameAvailable: true,
        hostedDeferred: true
      }}
    />
  );

  expect(html).toContain("Local Playtest");
  expect(html).toContain("Placeholder data");
  expect(html).toContain("Saved local game available");
  expect(html).toContain("Public hosting deferred");
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w app -- NewGameSetupSummary.test.tsx
```

Expected: fail because `localPlaytestStatus` does not exist.

- [ ] **Step 3: Add `LocalPlaytestStatus` prop and UI**

Modify `NewGameSetup.tsx`:

```ts
export type LocalPlaytestStatus = {
  dataMode: "placeholder" | "private";
  savedGameAvailable: boolean;
  hostedDeferred: boolean;
};
```

Add to `NewGameSetupProps`:

```ts
localPlaytestStatus?: LocalPlaytestStatus;
```

Render after the launch summary:

```tsx
{localPlaytestStatus ? (
  <section className="setup-section setup-section--wide" aria-label="Local Playtest">
    <legend>Local Playtest</legend>
    <p className="setup-help">
      {localPlaytestStatus.dataMode === "placeholder" ? "Placeholder data" : "Private data loaded"}
      {" · "}
      {localPlaytestStatus.savedGameAvailable ? "Saved local game available" : "No saved local game"}
      {" · "}
      {localPlaytestStatus.hostedDeferred ? "Public hosting deferred" : "Public hosting active"}
    </p>
  </section>
) : null}
```

- [ ] **Step 4: Wire status from `App.tsx`**

Pass to `NewGameSetup`:

```tsx
localPlaytestStatus={{
  dataMode: "placeholder",
  savedGameAvailable: savedLocalGame.kind === "valid",
  hostedDeferred: true
}}
```

If private data is loaded in setup state inside `NewGameSetup`, adjust Step 3 so `NewGameSetup` derives `dataMode` from `hasPrivateData(privateData)` instead of receiving it from `App.tsx`. Keep the visible labels exactly as tested.

- [ ] **Step 5: Run focused app tests**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w app -- NewGameSetupSummary.test.tsx App.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit local playtest status UI**

Run from repo root:

```powershell
git add imperium-like-digital-prototype/app/src/App.tsx imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx imperium-like-digital-prototype/app/src/ui/setup/NewGameSetupSummary.test.tsx
git commit -m "feat: show local playtest readiness"
```

---

### Task 4: Document The Local Playtest Loop

**Files:**
- Modify: `README.md`
- Modify: `imperium-like-digital-prototype/docs/deployment.md`
- Modify: `docs/superpowers/plans/2026-07-14-polity-public-fixtures-first-next-steps.md`

- [ ] **Step 1: Update README**

Add under `Running and Testing the App`:

```markdown
Run a local playtest server with temporary storage:

```powershell
npm.cmd run playtest:local
```

Run the local two-context browser QA gate:

```powershell
npm.cmd run qa:local-browser
```

These commands use public-safe placeholder data and do not require private CSV files or public hosting.
```

- [ ] **Step 2: Update deployment notes**

Append to `Deferred Hosted Gate` in `imperium-like-digital-prototype/docs/deployment.md`:

```markdown
While public hosting is deferred, use `npm.cmd run qa:local-browser` as the local browser QA gate. It does not replace hosted proof; it keeps the browser multiplayer flow covered until a public origin exists.
```

- [ ] **Step 3: Update the public-fixtures plan**

In `docs/superpowers/plans/2026-07-14-polity-public-fixtures-first-next-steps.md`, add an execution note under Task 8 Step 4:

```markdown
Execution note: local browser QA is covered by `docs/superpowers/plans/2026-07-14-polity-local-qa-playtestability.md` while public hosting is deferred. Hosted browser QA remains open and must be rerun against the actual public origin later.
```

- [ ] **Step 4: Run docs status check**

Run from repo root:

```powershell
git diff -- README.md imperium-like-digital-prototype/docs/deployment.md docs/superpowers/plans/2026-07-14-polity-public-fixtures-first-next-steps.md
```

Expected: only local QA/playtest documentation changes; no private data paths are staged.

- [ ] **Step 5: Commit docs**

Run from repo root:

```powershell
git add README.md imperium-like-digital-prototype/docs/deployment.md docs/superpowers/plans/2026-07-14-polity-public-fixtures-first-next-steps.md
git commit -m "docs: document local playtest QA loop"
```

---

### Task 5: Final Local QA Verification

**Files:**
- Verify only: `imperium-like-digital-prototype`
- Verify only: repo root git status

- [ ] **Step 1: Run local QA gates**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test:local-qa-scripts
npm.cmd run qa:local-browser
```

Expected: both exit 0.

- [ ] **Step 2: Run existing public-safe gates**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run typecheck
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run test -w engine
npm.cmd run smoke:fictional-game
npm.cmd run smoke:multiplayer
```

Expected: all exit 0.

- [ ] **Step 3: Confirm private and hosted gates remain deferred**

Run from repo root:

```powershell
git status --short
git diff --cached --name-only
```

Expected:

```text
```

No staged files. No `private-card-data/imperium_*_private.csv` files and no `generated-private/` files appear.

- [ ] **Step 4: Commit final evidence note only if needed**

If the previous tasks already committed all docs and no evidence note is needed, skip this step. If a dated local QA evidence note is added to `README.md` or `imperium-like-digital-prototype/docs/deployment.md`, run:

```powershell
git add README.md imperium-like-digital-prototype/docs/deployment.md
git commit -m "docs: record local browser QA evidence"
```

---

## Final Verification Gate

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test:local-qa-scripts
npm.cmd run qa:local-browser
npm.cmd run typecheck
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run test -w engine
npm.cmd run smoke:fictional-game
npm.cmd run smoke:multiplayer
```

Run from repo root:

```powershell
git status --short --branch
git diff --cached --name-only
```

Expected: branch is clean after commits, with no private CSV or generated private JSON staged.

## Self-Review

- Spec coverage: The plan covers local automated QA, human local playtestability, docs, and preservation of hosted/private gates.
- Placeholder scan: No `TBD`, `TODO`, or vague implementation-only placeholders are present.
- Type consistency: Script names, package script names, exported helper names, and UI prop names are consistent across tasks.
- Scope check: This plan is local-only and does not attempt hosted deployment or private import.
