# Hosted Release Handoff

This handoff covers the public hosting gate before private data is introduced. As of 2026-07-22, the hosted gate has passed and the remaining final gate is local private-data import/completeness.

## Deployment Candidate

- Repository: `jcdaneshmand/polity-engine`
- Branch: `origin/main`
- Deploy the latest pushed head of `origin/main`.

Private data remains local-only. Hosted proof has passed, so `private:preflight`, `private:import-all`, and `private:completeness` may run locally once the ignored private CSV sources are present.

## Render Settings To Confirm

The repository `render.yaml` already declares:

- root directory: `imperium-like-digital-prototype`
- plan: `starter` so the persistent disk is supported
- build command: `npm ci && npm run build -w app && npm run typecheck`
- start command: `npm run start`
- health check: `/polity/accounts/health`
- persistent disk: `/var/data`
- storage path: `POLITY_STORAGE_PATH=/var/data/polity-engine`
- public debug disabled: `VITE_SHOW_PRIVATE_CARD_DEBUG=false`

In the Render dashboard, confirm:

- deployed branch is `main`
- `POLITY_SERVER_ORIGIN` equals the exact public origin
- persistent disk is attached at `/var/data`
- the latest deployed commit is visible and matches the intended branch head

Render does not support disks on free web services. Keep the disk and use a disk-compatible paid service plan for release proof; removing the disk would make restart/storage persistence evidence weaker and should be treated as a temporary demo-only configuration.

If using Codex or another MCP client to deploy directly, the Render account must expose service-management tools such as `list_services`, `list_deploys`, and `update_environment_variables`. Installing the skill alone is not enough; the active task also needs an authenticated Render MCP server or a local Render CLI session with `RENDER_API_KEY` configured.

## Current Hosted State

As of 2026-07-21, `https://polity-engine.onrender.com` is reachable but does not appear to be serving this Polity Engine service:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
npm.cmd run smoke:hosted
```

Result: `GET /polity/accounts/health failed with 404: Not Found`.

After pushing the Render Blueprint hardening commit `46b984c`, the same hosted smoke was rerun against `https://polity-engine.onrender.com` and still returned `GET /polity/accounts/health failed with 404: Not Found`. The result was checked again on 2026-07-22 with the current local gate worktree, and `npm.cmd run smoke:hosted` still returned `GET /polity/accounts/health failed with 404: Not Found`. The next-gates work was then committed and pushed to `origin/main` at `16bfa7c`; the same hosted smoke still returned `GET /polity/accounts/health failed with 404: Not Found`.

After Render went live on 2026-07-22, both hosted gates passed against `https://polity-engine.onrender.com`:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
npm.cmd run smoke:hosted
npm.cmd run qa:hosted-browser
```

The hosted browser QA passed setup, local board, worked-turn, automated practice, automated solo, two-seat online multiplayer self-play, viewport QA, save/resume, invalid save, and private-debug marker checks.

The next local check was `npm.cmd run private:preflight`. It reached the final gate but stopped because the expected ignored private CSV sources are not present under `private-card-data/`.

## Hosted Proof To Maintain

After future deploys, rerun from `imperium-like-digital-prototype`:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
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

## Evidence Recorded

The current evidence is recorded in `docs/deployment.md` and `docs/superpowers/plans/2026-07-22-next-gates.md`:

- public origin
- deployed branch and commit context
- `smoke:hosted` command and result
- `qa:hosted-browser` command and result
- private-debug disabled proof

The private-data final gate remains open until the ignored local private CSV sources are available.
