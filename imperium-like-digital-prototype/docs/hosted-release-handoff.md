# Hosted Release Handoff

This handoff covers the public hosting gate before private data is introduced.

## Deployment Candidate

- Repository: `jcdaneshmand/polity-engine`
- Branch: `agent/remaining-gaps-rules-playability`
- Current pushed head at handoff: `2b74f8e`
- PR URL, if needed: `https://github.com/jcdaneshmand/polity-engine/pull/new/agent/remaining-gaps-rules-playability`

Private data remains out of scope for this gate. Do not run `private:preflight`, `private:import-all`, or `private:completeness` until hosted proof passes.

## Render Settings To Confirm

The repository `render.yaml` already declares:

- root directory: `imperium-like-digital-prototype`
- plan: `free`
- build command: `npm ci && npm run build -w app && npm run typecheck`
- start command: `npm run start`
- health check: `/polity/accounts/health`
- persistent disk: `/var/data`
- storage path: `POLITY_STORAGE_PATH=/var/data/polity-engine`
- public debug disabled: `VITE_SHOW_PRIVATE_CARD_DEBUG=false`

In the Render dashboard, confirm:

- deployed branch is `agent/remaining-gaps-rules-playability` or a branch that includes it
- `POLITY_SERVER_ORIGIN` equals the exact public origin
- persistent disk is attached at `/var/data`
- the latest deployed commit is visible and matches the intended branch head

If using Codex or another MCP client to deploy directly, the Render account must expose service-management tools such as `list_services`, `list_deploys`, and `update_environment_variables`. Installing the skill alone is not enough; the active task also needs an authenticated Render MCP server or a local Render CLI session with `RENDER_API_KEY` configured.

## Current Hosted State

As of 2026-07-21, `https://polity-engine.onrender.com` is reachable but does not appear to be serving this Polity Engine service:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
npm.cmd run smoke:hosted
```

Result: `GET /polity/accounts/health failed with 404: Not Found`.

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
npm.cmd run qa:hosted-browser
```

Result: timed out waiting for `/polity/accounts/health` with `404 Not Found`.

## Required Hosted Proof

After redeploying or supplying the correct public origin, run from `imperium-like-digital-prototype`:

```powershell
$env:POLITY_HOSTED_BASE_URL="<actual public origin>"
npm.cmd run smoke:hosted
npm.cmd run qa:hosted-browser
```

Expected hosted smoke proof:

- account health endpoint returns `ok=true`
- React app shell loads
- lobby listing returns an array
- placeholder lobby can be created and listed
- private-debug markers are absent
- smoke-created lobby is cleaned up

Expected hosted browser proof:

- setup status is visible
- placeholder local board renders
- playtest diagnostics panel renders
- local save/resume UI works in browser storage
- corrupt local save is rejected visibly
- hosted lobby can be created
- second context can join
- both seats can ready/start
- both contexts can rejoin a started match
- private-debug markers are absent

## Evidence To Record

Update `docs/deployment.md` and `docs/superpowers/plans/2026-07-20-polity-remaining-gaps-rules-playability.md` with:

- public origin
- deployed branch and commit
- Render storage path and disk confirmation
- `smoke:hosted` command and result
- `qa:hosted-browser` command and result
- any restart/storage persistence proof
- private-debug disabled proof

Only after that evidence is recorded should Task 8, the private data final gate, begin.
