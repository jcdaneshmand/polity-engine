# Render Deployment Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the repository so Polity Engine can deploy cleanly to Render as one Web Service serving the Vite app, lobby APIs, and boardgame.io Socket.IO multiplayer server.

**Architecture:** Keep the existing three-workspace split: `app` builds static assets, `engine` remains shared game logic, and `server` runs the single public Node process. Render should start the server from the repository checkout after building `app/dist`, with `POLITY_STORAGE_PATH` pointing at a persistent disk mount and `POLITY_SERVER_ORIGIN` restricted to the deployed origin.

**Tech Stack:** React, Vite, TypeScript, boardgame.io, Socket.IO transport, Render Web Service, Render persistent disk, npm workspaces.

---

## File Structure

- Modify `imperium-like-digital-prototype/package.json`
  - Add root deployment scripts that Render can call from the app workspace without remembering individual workspace commands.
  - Keep existing local development scripts intact.
- Modify `imperium-like-digital-prototype/server/package.json`
  - Add `start`, `build`, and `render:verify` scripts.
  - Use the existing `tsx` runtime for server startup unless a later task adds a bundled JS build.
- Modify `imperium-like-digital-prototype/server/src/serverConfig.ts`
  - Accept Render's `PORT` as a fallback while preserving `POLITY_SERVER_PORT` for local and explicit deployments.
  - Keep CORS origins explicit for production.
- Modify `imperium-like-digital-prototype/server/src/serverConfig.test.ts`
  - Add coverage for `PORT` fallback and precedence.
- Modify `imperium-like-digital-prototype/server/src/staticApp.test.ts`
  - Add or extend coverage proving SPA fallback works when `app/dist/index.html` exists and API/socket paths are passed through.
- Create `imperium-like-digital-prototype/render.yaml`
  - Document the Render Blueprint for the single Web Service, build command, start command, disk mount, and environment variables.
- Create `imperium-like-digital-prototype/docs/render-deployment.md`
  - Human deployment runbook with Render dashboard values, required env vars, DNS/domain notes, legal/private-data release checks, and smoke tests.
- Modify `imperium-like-digital-prototype/docs/multiplayer-implementation-plan.md`
  - Mark the deployment-preparation pieces that this plan satisfies.
- Do not modify or commit `private-card-data/*` or `generated-private/*.json`.

## Task 1: Add Render-Aware Server Config

**Files:**
- Modify: `imperium-like-digital-prototype/server/src/serverConfig.ts`
- Modify: `imperium-like-digital-prototype/server/src/serverConfig.test.ts`

- [ ] **Step 1: Write failing tests for Render `PORT` fallback**

Add tests to `server/src/serverConfig.test.ts`:

```ts
it("uses Render PORT when POLITY_SERVER_PORT is not set", () => {
  expect(buildServerConfig({ PORT: "10000" }).port).toBe(10000);
});

it("lets POLITY_SERVER_PORT override Render PORT", () => {
  expect(buildServerConfig({ POLITY_SERVER_PORT: "9001", PORT: "10000" }).port).toBe(9001);
});
```

- [ ] **Step 2: Run the targeted test and verify failure**

Run from `imperium-like-digital-prototype`:

```powershell
npm run test -w server -- serverConfig.test.ts
```

Expected: FAIL because `ServerEnvironment` does not yet include `PORT` and `buildServerConfig` ignores it.

- [ ] **Step 3: Implement `PORT` fallback**

Update `server/src/serverConfig.ts`:

```ts
export type ServerEnvironment = Partial<Record<
  "POLITY_SERVER_PORT" | "POLITY_SERVER_ORIGIN" | "POLITY_STORAGE_PATH" | "PORT",
  string
>>;

export function buildServerConfig(env: ServerEnvironment): ServerConfig {
  return {
    port: parsePort(env.POLITY_SERVER_PORT ?? env.PORT),
    origins: parseOrigins(env.POLITY_SERVER_ORIGIN),
    storageDir: env.POLITY_STORAGE_PATH?.trim() || undefined
  };
}
```

- [ ] **Step 4: Verify server config tests pass**

Run:

```powershell
npm run test -w server -- serverConfig.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add server/src/serverConfig.ts server/src/serverConfig.test.ts
git commit -m "chore: support render port configuration"
```

## Task 2: Add Production-Friendly npm Scripts

**Files:**
- Modify: `imperium-like-digital-prototype/package.json`
- Modify: `imperium-like-digital-prototype/server/package.json`

- [ ] **Step 1: Write the expected script contract**

Before editing, run:

```powershell
npm run render:verify
```

Expected: FAIL with a missing script error.

- [ ] **Step 2: Add root deployment scripts**

In `imperium-like-digital-prototype/package.json`, add:

```json
"build:render": "npm run build -w app && npm run typecheck -w server",
"start:render": "npm run start -w server",
"render:verify": "npm run typecheck && npm run test -w server && npm run build -w app"
```

Keep the existing scripts unchanged.

- [ ] **Step 3: Add server start/build scripts**

In `imperium-like-digital-prototype/server/package.json`, update `scripts`:

```json
"scripts": {
  "dev": "tsx src/index.ts",
  "start": "tsx src/index.ts",
  "build": "tsc -p tsconfig.json --noEmit",
  "test": "vitest run",
  "typecheck": "tsc -p tsconfig.json --noEmit"
}
```

This deliberately uses `tsx` for the server start so the current engine/server TypeScript imports do not need a bundling migration before the first Render deployment.

- [ ] **Step 4: Verify script discovery**

Run:

```powershell
npm run build:render
```

Expected: `app` Vite build succeeds and `server` typecheck succeeds. A Vite large chunk warning is acceptable.

- [ ] **Step 5: Verify full deployment check**

Run:

```powershell
npm run render:verify
```

Expected: app, engine, and server typechecks pass; server tests pass; app build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add package.json server/package.json
git commit -m "chore: add render deployment scripts"
```

## Task 3: Lock Down Static App Serving Behavior

**Files:**
- Modify: `imperium-like-digital-prototype/server/src/staticApp.test.ts`
- Modify if needed: `imperium-like-digital-prototype/server/src/staticApp.ts`

- [ ] **Step 1: Add tests for Render single-origin routing**

Ensure `server/src/staticApp.test.ts` covers:

```ts
it("serves index.html for app routes", async () => {
  const middleware = createStaticAppMiddleware(distDir);
  const ctx = createContext({ method: "GET", path: "/online" });
  await middleware(ctx, next);
  expect(ctx.type).toBe("text/html");
  expect(String(ctx.body)).toContain("<div id=\"root\"></div>");
});

it("passes boardgame and socket routes through to later middleware", async () => {
  const middleware = createStaticAppMiddleware(distDir);
  const gamesCtx = createContext({ method: "GET", path: "/games/polity-engine" });
  await middleware(gamesCtx, next);
  expect(next).toHaveBeenCalled();
});
```

Adapt helper names to the existing test file instead of duplicating helpers.

- [ ] **Step 2: Run the targeted test**

Run:

```powershell
npm run test -w server -- staticApp.test.ts
```

Expected: PASS, or FAIL only where the test reveals a real single-origin routing bug.

- [ ] **Step 3: Fix only real routing gaps**

If `/socket.io` is not already passed through by test coverage, add an explicit guard in `staticApp.ts`:

```ts
if (ctx.path.startsWith("/games") || ctx.path.startsWith("/socket.io") || !existsSync(indexPath)) {
  await next();
  return;
}
```

Do not change the existing `/polity` behavior unless a test shows it is intercepted; the current middleware is installed after the lobby middleware, so `/polity` should already be handled before static fallback.

- [ ] **Step 4: Verify server tests**

Run:

```powershell
npm run test -w server
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add server/src/staticApp.ts server/src/staticApp.test.ts
git commit -m "test: cover render static routing"
```

## Task 4: Add Render Blueprint

**Files:**
- Create: `imperium-like-digital-prototype/render.yaml`

- [ ] **Step 1: Create the blueprint**

Create `render.yaml`:

```yaml
services:
  - type: web
    name: polity-engine
    runtime: node
    plan: starter
    rootDir: imperium-like-digital-prototype
    buildCommand: npm ci && npm run build:render
    startCommand: npm run start:render
    envVars:
      - key: NODE_VERSION
        value: 22
      - key: POLITY_SERVER_ORIGIN
        sync: false
      - key: POLITY_STORAGE_PATH
        value: /var/data/polity
      - key: VITE_SHOW_PRIVATE_CARD_DEBUG
        value: "false"
    disk:
      name: polity-data
      mountPath: /var/data
      sizeGB: 1
```

- [ ] **Step 2: Validate YAML shape locally**

Run:

```powershell
node -e "const fs=require('fs'); const text=fs.readFileSync('render.yaml','utf8'); if (!text.includes('buildCommand: npm ci && npm run build:render')) process.exit(1); console.log('render blueprint present')"
```

Expected: `render blueprint present`.

- [ ] **Step 3: Commit**

```powershell
git add render.yaml
git commit -m "chore: add render blueprint"
```

## Task 5: Document the Render Deployment Runbook

**Files:**
- Create: `imperium-like-digital-prototype/docs/render-deployment.md`
- Modify: `imperium-like-digital-prototype/docs/multiplayer-implementation-plan.md`

- [ ] **Step 1: Write the deployment runbook**

Create `docs/render-deployment.md` with:

```md
# Render Deployment

## Deployment Shape

Polity Engine deploys as one Render Web Service from `imperium-like-digital-prototype`.
The Node server serves:

- `/` and app routes from `app/dist`
- `/polity/lobby/*` lobby APIs
- `/games/*` boardgame.io APIs
- `/socket.io/*` multiplayer transport

## Render Settings

- Service type: Web Service
- Runtime: Node
- Root directory: `imperium-like-digital-prototype`
- Build command: `npm ci && npm run build:render`
- Start command: `npm run start:render`
- Persistent disk mount: `/var/data`

## Environment Variables

Set:

- `POLITY_SERVER_ORIGIN=https://<deployed-domain>`
- `POLITY_STORAGE_PATH=/var/data/polity`
- `VITE_SHOW_PRIVATE_CARD_DEBUG=false`

Render provides `PORT`; the server also accepts `POLITY_SERVER_PORT` for local overrides.

## Release Boundary

Before public deployment:

1. Do not commit `private-card-data/*` source files.
2. Do not commit `generated-private/*.json`.
3. Keep `VITE_SHOW_PRIVATE_CARD_DEBUG=false`.
4. Run `rg "privateName|rawEffectTextPrivate" app/src/ui` and confirm all display paths route through `app/src/ui/debug/privateCardDebug.ts`.

## Local Verification

Run:

```powershell
npm run render:verify
```

Then run the server against production-like settings:

```powershell
$env:POLITY_SERVER_PORT="8000"
$env:POLITY_SERVER_ORIGIN="http://localhost:8000"
$env:POLITY_STORAGE_PATH="tmp/render-smoke"
npm run start:render
```

Open `http://localhost:8000` and smoke:

1. App shell loads.
2. Online lobby list loads.
3. Host a placeholder-data lobby.
4. Join from another browser profile or private window.
5. Start a match and confirm both clients connect.

## Render Smoke

After deploy:

1. Visit the Render URL.
2. Confirm app routes reload without 404.
3. Confirm `/polity/lobby/matches` returns JSON.
4. Host and join one placeholder-data online match.
5. Restart the service and confirm a match can be listed or rejoined if persistence is enabled.
```

- [ ] **Step 2: Update multiplayer plan deployment phase**

In `docs/multiplayer-implementation-plan.md`, under Phase 10, add:

```md
Initial Render deployment alignment is tracked in `docs/superpowers/plans/2026-06-05-render-deployment-alignment.md` and operationalized in `docs/render-deployment.md`.
```

- [ ] **Step 3: Verify release-boundary commands**

Run:

```powershell
rg "privateName|rawEffectTextPrivate" app/src/ui
```

Expected: output shows private-field display goes through the canonical debug guard or tests for that guard.

- [ ] **Step 4: Commit**

```powershell
git add docs/render-deployment.md docs/multiplayer-implementation-plan.md
git commit -m "docs: add render deployment runbook"
```

## Task 6: Production-Like Local Smoke

**Files:**
- No source edits unless this task reveals a real deployment bug.

- [ ] **Step 1: Run the deployment verification suite**

Run from `imperium-like-digital-prototype`:

```powershell
npm run render:verify
```

Expected: PASS, with Vite large-chunk warnings acceptable.

- [ ] **Step 2: Start the app as Render would**

Run:

```powershell
$env:POLITY_SERVER_PORT="8000"
$env:POLITY_SERVER_ORIGIN="http://localhost:8000"
$env:POLITY_STORAGE_PATH="tmp/render-smoke"
$env:VITE_SHOW_PRIVATE_CARD_DEBUG="false"
npm run start:render
```

Expected: `Polity Engine multiplayer server listening on port 8000`.

- [ ] **Step 3: Smoke the HTTP API**

In a second terminal:

```powershell
Invoke-WebRequest -Uri http://localhost:8000/polity/lobby/matches -UseBasicParsing
```

Expected: status `200` and JSON containing a `matches` property.

- [ ] **Step 4: Smoke the static app**

Run:

```powershell
Invoke-WebRequest -Uri http://localhost:8000 -UseBasicParsing
```

Expected: status `200` and HTML containing the Vite app root.

- [ ] **Step 5: Manual browser smoke**

Open `http://localhost:8000` and test:

1. Online lobby page loads.
2. Host a placeholder-data lobby.
3. Join from another browser profile or private window.
4. Start the match.
5. Confirm both clients connect.

- [ ] **Step 6: Commit any smoke fixes**

Only if source changes were required:

```powershell
git add <changed-files>
git commit -m "fix: align render smoke behavior"
```

## Task 7: Final Pre-Deployment Checklist

**Files:**
- No required source edits.

- [ ] **Step 1: Confirm git cleanliness**

Run:

```powershell
git status --short
```

Expected: only intended committed changes, or clean.

- [ ] **Step 2: Confirm private data is not staged**

Run:

```powershell
git status --short private-card-data generated-private
```

Expected: no staged private/generated JSON or CSV files.

- [ ] **Step 3: Confirm Render variables**

In Render dashboard or blueprint, confirm:

```text
POLITY_SERVER_ORIGIN=https://<actual Render or custom domain>
POLITY_STORAGE_PATH=/var/data/polity
VITE_SHOW_PRIVATE_CARD_DEBUG=false
```

- [ ] **Step 4: Deploy**

Deploy the service from GitHub or the Render Blueprint.

- [ ] **Step 5: Post-deploy smoke**

Run or manually verify:

```text
GET https://<deployed-domain>/polity/lobby/matches -> 200 JSON
GET https://<deployed-domain>/ -> 200 HTML
Browser host/join/start placeholder online match -> works
```

## Self-Review

- Spec coverage: Covers production port handling, npm scripts, static serving, Render Blueprint, persistent disk config, legal/private-data safeguards, local verification, and deployed smoke.
- Placeholder scan: No placeholder tokens or unspecified implementation steps remain.
- Type consistency: Uses existing `POLITY_SERVER_PORT`, `POLITY_SERVER_ORIGIN`, `POLITY_STORAGE_PATH`, `VITE_SHOW_PRIVATE_CARD_DEBUG`, `buildServerConfig`, and `createStaticAppMiddleware` names.
- Scope check: Keeps the first deployment on the existing FlatFile/persistent-disk architecture. A future Postgres migration is intentionally out of scope.
