# Polity Product Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Polity Engine from a locally verified multiplayer baseline to a deployable, browser-verified product slice with clear remaining rules/content work.

**Architecture:** Keep the current single Node service shape: Render builds from `imperium-like-digital-prototype`, serves the React app, exposes lobby/account APIs, and runs boardgame.io with persistent storage under `POLITY_STORAGE_PATH`. Treat the multiplayer smoke test as the core regression gate, then add deployment/browser checks and private-data/rules readiness checks around it.

**Tech Stack:** TypeScript, React, Vite, Vitest, boardgame.io, node-persist, Render Blueprint, PowerShell on Windows with `npm.cmd`.

---

## Current State

- Current repo root: `E:\Repositories\Jonah\polity-engine`
- Main app root: `E:\Repositories\Jonah\polity-engine\imperium-like-digital-prototype`
- Current branch: `main`
- Current state: clean working tree, `main` is ahead of `origin/main` by one commit.
- Latest local commit: `13373cb feat: harden multiplayer baseline`
- Highest-value regression gate: `npm.cmd run smoke:multiplayer` from `imperium-like-digital-prototype`
- Full local verification gate: `npm.cmd run typecheck`, `npm.cmd run test -w app`, `npm.cmd run test -w server`, `npm.cmd run smoke:multiplayer`

## File Structure

- `render.yaml`: Render web service blueprint rooted at `imperium-like-digital-prototype`.
- `imperium-like-digital-prototype/docs/deployment.md`: deployment runbook and post-deploy checklist.
- `imperium-like-digital-prototype/server/src/serverConfig.ts`: hosted port/origin/storage configuration.
- `imperium-like-digital-prototype/server/src/staticApp.ts`: built app serving path.
- `imperium-like-digital-prototype/scripts` is not present; smoke and dev scripts live at root `scripts/`.
- `scripts/multiplayer-smoke.mjs`: multiplayer create/join/start/restart/rejoin smoke coverage.
- `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`: public-safe runtime parity evidence.
- `imperium-like-digital-prototype/private-card-data/`: templates only; keep private CSVs uncommitted.
- `imperium-like-digital-prototype/generated-private/`: generated private-data outputs; keep official/private content out of commits.
- `imperium-like-digital-prototype/docs/private-card-data-workflow.md`: private data workflow.
- `imperium-like-digital-prototype/docs/private-bot-table-workflow.md`: Bot table workflow.

---

### Task 1: Publish The Verified Baseline

**Files:**
- Verify only: `E:\Repositories\Jonah\polity-engine`

- [ ] **Step 1: Confirm the branch state**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -3
```

Expected:

```text
## main...origin/main [ahead 1]
13373cb (HEAD -> main) feat: harden multiplayer baseline
```

- [ ] **Step 2: Push the local baseline**

Run:

```powershell
git push origin main
```

Expected: push succeeds and `origin/main` includes `13373cb`.

- [ ] **Step 3: Confirm the branch is synchronized**

Run:

```powershell
git status --short --branch
```

Expected:

```text
## main...origin/main
```

Do not start deployment work until this is true; Render should deploy from the same baseline that passed local verification.

---

### Task 2: Re-Run The Local Release Gate

**Files:**
- Verify: `imperium-like-digital-prototype/package.json`
- Verify: `scripts/multiplayer-smoke.mjs`
- Verify: `imperium-like-digital-prototype/server/src/serverConfig.ts`

- [ ] **Step 1: Run typecheck**

Run from `E:\Repositories\Jonah\polity-engine\imperium-like-digital-prototype`:

```powershell
npm.cmd run typecheck
```

Expected: all engine, app, and server TypeScript checks pass.

- [ ] **Step 2: Run app tests**

Run:

```powershell
npm.cmd run test -w app
```

Expected: app Vitest suite passes.

- [ ] **Step 3: Run server tests**

Run:

```powershell
npm.cmd run test -w server
```

Expected: server Vitest suite passes, including config, lobby, account, and multiplayer transport tests.

- [ ] **Step 4: Run multiplayer smoke**

Run:

```powershell
npm.cmd run smoke:multiplayer
```

Expected: the smoke script builds the app, starts the server, creates a lobby, joins seats, starts a match, restarts the service, and verifies rejoin/storage continuity.

- [ ] **Step 5: Record the release gate result**

If all commands pass, add a short dated note to `imperium-like-digital-prototype/docs/deployment.md` under a new `## Local Release Gate` section:

```markdown
## Local Release Gate

- 2026-06-24: `npm.cmd run typecheck`, `npm.cmd run test -w app`, `npm.cmd run test -w server`, and `npm.cmd run smoke:multiplayer` passed from `imperium-like-digital-prototype` before hosted deployment.
```

Then run:

```powershell
git diff -- imperium-like-digital-prototype/docs/deployment.md
```

Expected: only the dated release-gate note is changed.

---

### Task 3: Prove Hosted Deployment Shape

**Files:**
- Verify/modify if needed: `render.yaml`
- Verify/modify if needed: `imperium-like-digital-prototype/docs/deployment.md`
- Verify/modify if needed: `imperium-like-digital-prototype/server/src/serverConfig.ts`
- Verify/modify if needed: `imperium-like-digital-prototype/server/src/staticApp.ts`
- Test: `imperium-like-digital-prototype/server/src/serverConfig.test.ts`
- Test: `imperium-like-digital-prototype/server/src/staticApp.test.ts`

- [ ] **Step 1: Review Render blueprint**

Run from repo root:

```powershell
Get-Content -LiteralPath .\render.yaml
```

Expected:

```yaml
rootDir: imperium-like-digital-prototype
buildCommand: npm install && npm run build -w app && npm run typecheck
startCommand: npm run start
healthCheckPath: /polity/accounts/health
```

- [ ] **Step 2: Confirm required environment variables**

In Render, configure:

```text
POLITY_SERVER_ORIGIN=https://<actual-render-app-url>
POLITY_STORAGE_PATH=/var/data/polity-engine
VITE_SHOW_PRIVATE_CARD_DEBUG=false
```

Expected: `POLITY_SERVER_ORIGIN` exactly matches the public app origin, including `https://`, with no trailing path.

- [ ] **Step 3: Run a local hosted-port simulation**

Run from `imperium-like-digital-prototype`:

```powershell
$env:PORT='4177'; $env:POLITY_STORAGE_PATH="$pwd\.tmp-hosted-storage"; npm.cmd run start
```

Expected: server starts on port `4177` using `PORT` when `POLITY_SERVER_PORT` is unset.

- [ ] **Step 4: Check the health endpoint**

In a second terminal:

```powershell
Invoke-RestMethod -Uri 'http://localhost:4177/polity/accounts/health'
```

Expected: health response succeeds.

- [ ] **Step 5: Check the React shell**

Open:

```text
http://localhost:4177/
```

Expected: the built React app loads from the same Node service.

- [ ] **Step 6: Stop the local service and clean local temp storage**

Stop the server with `Ctrl+C`, then remove only the hosted temp storage directory:

```powershell
Remove-Item -LiteralPath .\.tmp-hosted-storage -Recurse -Force
```

Expected: temp storage is removed; no project files are deleted.

---

### Task 4: Browser-QA The Multiplayer Happy Path

**Files:**
- Verify/modify if needed: `imperium-like-digital-prototype/app/src/ui/online/OnlineGames.tsx`
- Verify/modify if needed: `imperium-like-digital-prototype/app/src/ui/online/LobbyRoom.tsx`
- Verify/modify if needed: `imperium-like-digital-prototype/app/src/accountSession.ts`
- Test: `imperium-like-digital-prototype/app/src/ui/online/OnlineGames.test.tsx`
- Test: `imperium-like-digital-prototype/app/src/ui/online/LobbyRoom.test.tsx`
- Test: `imperium-like-digital-prototype/app/src/accountSession.test.ts`

- [ ] **Step 1: Start the full local stack**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run dev:full
```

Expected: Vite and the multiplayer server start without port conflicts.

- [ ] **Step 2: Test guest entry manually**

Open the local app URL printed by `dev:full`. Use the UI to:

```text
Enter online mode
Continue as guest
Create a multiplayer lobby
Select a visible nation
Ready up
```

Expected: no `invalid_nation` error; the ready state is visible.

- [ ] **Step 3: Test account entry manually**

Use a separate browser context or private window to:

```text
Create/sign into an account
Join the existing lobby
Select a different visible nation
Ready up
Start the match
```

Expected: the second player can join, ready, and start without stale guest/account state.

- [ ] **Step 4: Test rejoin continuity**

Refresh both browser contexts after match start.

Expected: each player can rejoin the correct seat and sees the started match, not an orphaned lobby.

- [ ] **Step 5: Convert any manual failure into a test**

If a bug appears, add the smallest reproducing test to the matching file:

```text
OnlineGames.test.tsx for entry/session selection bugs
LobbyRoom.test.tsx for lobby ready/rejoin/start bugs
accountSession.test.ts for stored session bugs
```

Run:

```powershell
npm.cmd run test -w app
```

Expected: the new test fails before the fix and passes after the fix.

---

### Task 5: Add Hosted Smoke Coverage If Manual QA Finds A Gap

**Files:**
- Modify if needed: `scripts/multiplayer-smoke.mjs`
- Modify if needed: `imperium-like-digital-prototype/package.json`

- [ ] **Step 1: Identify whether the gap is scriptable**

Promote only repeatable hosted-runtime gaps into smoke coverage:

```text
PORT fallback
static app serving
health endpoint
restart-safe metadata
rejoin after restart
seat reservation after restart
```

Do not put one-off visual assertions into the smoke script.

- [ ] **Step 2: Extend `scripts/multiplayer-smoke.mjs`**

Add the smallest check that reproduces the hosted gap. For example, if static serving is uncovered, add a fetch after the server starts:

```js
const appResponse = await fetch(`${baseUrl}/`);
if (!appResponse.ok) {
  throw new Error(`Expected app shell to load, got ${appResponse.status}`);
}
```

- [ ] **Step 3: Run the smoke gate**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run smoke:multiplayer
```

Expected: the new hosted assertion and existing multiplayer assertions pass.

---

### Task 6: Private-Data And Rules Readiness Sweep

**Files:**
- Verify/modify if needed: `imperium-like-digital-prototype/docs/rules-engine-parity-matrix.md`
- Verify/modify if needed: `imperium-like-digital-prototype/docs/rules-engine-compliance-checklist.md`
- Verify/modify if needed: `imperium-like-digital-prototype/docs/private-card-data-workflow.md`
- Verify/modify if needed: `imperium-like-digital-prototype/docs/private-bot-table-workflow.md`
- Verify local-only outputs: `imperium-like-digital-prototype/generated-private/`
- Verify local-only inputs: `imperium-like-digital-prototype/private-card-data/`

- [ ] **Step 1: Run public rules tests**

Run from `imperium-like-digital-prototype`:

```powershell
npm.cmd run test -w engine
```

Expected: engine suite passes.

- [ ] **Step 2: Run private-data preflight if private CSVs exist locally**

Run:

```powershell
npm.cmd run private:preflight
```

Expected: private CSV schemas validate. If the private CSVs are absent, record that the sweep was skipped because only templates are present.

- [ ] **Step 3: Run private completeness if private CSVs exist locally**

Run:

```powershell
npm.cmd run private:completeness
```

Expected: the report classifies missing content without committing official/private data.

- [ ] **Step 4: Update docs only with public-safe status**

If the sweep reveals no runtime gap, keep `rules-engine-parity-matrix.md` statuses as `covered` or `private-data-only`.

If a concrete public-safe engine contract is missing, update the exact row to `weak-evidence` or `runtime-gap` and add a focused engine test before changing implementation.

- [ ] **Step 5: Confirm no private content is staged**

Run from repo root:

```powershell
git status --short
git diff --cached --name-only
```

Expected: no official/private CSV or generated JSON content is staged.

---

### Task 7: Decide The Next Product Slice

Choose the next implementation branch only after Tasks 1-6 are complete.

Recommended order:

1. **Hosted deployment proof:** finish Render live deployment and record post-deploy checks.
2. **Browser multiplayer polish:** fix issues found by manual two-context play.
3. **Save/load and undo:** roadmap Milestone 2/3 items that matter for real play sessions.
4. **Private-data transcription workflow:** improve local-only data entry/completeness if actual private CSV work is the bottleneck.
5. **Rules parity regressions:** only if a concrete row in the parity matrix drops from `covered`.

Exit criteria for choosing the next slice:

```text
main is synced to origin
local release gate passes
hosted app health endpoint works
hosted React shell loads
manual multiplayer happy path succeeds
no private official content is staged
```

---

## Self-Review

- Spec coverage: The plan covers the immediate repo state, current local-only commit, release verification, Render deployment proof, manual multiplayer QA, hosted smoke expansion, private-data/rules readiness, and next-slice choice.
- Placeholder scan: No `TBD`, `TODO`, or vague "add tests" placeholders remain; each task includes exact files, commands, and expected outcomes.
- Type consistency: Commands and paths match the current repo shape: root scripts live in `scripts/`, app/server/engine workspaces live under `imperium-like-digital-prototype`, and reliable Windows invocation uses `npm.cmd`.
