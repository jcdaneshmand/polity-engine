# Deployment Notes

Polity Engine can serve the built React app, the lobby HTTP API, and the Socket.IO boardgame transport from one Node web service.

## Required Runtime Shape

- Build from `imperium-like-digital-prototype`.
- Run `npm ci`, `npm run build -w app`, and `npm run typecheck` before deployment.
- Start with `npm run start`.
- Optional local deployment verifier: `npm.cmd run render:verify`.
- Expose the service port through `PORT` or `POLITY_SERVER_PORT`.
- Set `POLITY_SERVER_ORIGIN` to the exact public app origin, such as `https://polity-engine.example.com`.
- Set `POLITY_STORAGE_PATH` to a persistent disk path.
- Optional: set `VITE_PAYPAL_SUPPORT_URL` to override the default About-page hosting-support button.
- Render normally exposes commit metadata automatically. If a host does not, set `POLITY_BUILD_COMMIT` to the deployed commit SHA so hosted smoke can prove the app is serving the intended revision.

## Storage Layout

`POLITY_STORAGE_PATH` is a root directory owned by the app:

- `boardgame/` stores boardgame.io FlatFile match state.
- `accounts.json` stores local account/session metadata.
- `lobby-matches.json` stores active match metadata.
- `pregame-lobbies.json` stores pregame lobby metadata.

Do not point `POLITY_STORAGE_PATH` at a public static directory.

## Render Blueprint

The repository root includes `render.yaml`. It defines one disk-compatible Node web service rooted at `imperium-like-digital-prototype`, a persistent disk mounted at `/var/data`, `POLITY_STORAGE_PATH=/var/data/polity-engine`, and a health check at `/polity/accounts/health`. Render does not support disks on free web services, so this service must use a paid plan such as `starter` for release proof.

Before creating a public deployment, set `POLITY_SERVER_ORIGIN` in Render to the deployed URL. The app shows one default PayPal hosting-support button on the About page; set `VITE_PAYPAL_SUPPORT_URL` only if that link needs to be overridden. Leave `VITE_SHOW_PRIVATE_CARD_DEBUG` unset or `false` for public builds.

## Post-Deploy Checks

1. Open `/polity/accounts/health` and confirm it returns a successful response.
2. Open the deployed app root and confirm the React shell loads.
3. Create a multiplayer lobby with account or guest entry.
4. Restart the service and confirm the lobby or match metadata still appears.
5. Confirm no private CSV/JSON card data is committed or served.

Run the hosted smoke against the deployed origin:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
npm.cmd run smoke:hosted
```

For deployment proof after a push, also pin the expected commit:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
$env:POLITY_EXPECTED_COMMIT="<short-or-full-git-sha>"
npm.cmd run smoke:hosted
```

The hosted smoke checks account health, deployment commit identity, the React app shell, lobby room listing, placeholder/fictional lobby creation, and absence of private-debug markers in the served app shell. After verifying the placeholder lobby appears in the room listing, it calls the lobby leave endpoint for cleanup.

Before Render is available, run the same hosted smoke script against a temporary local server:

```powershell
npm.cmd run smoke:hosted:local
```

This is a local-only confidence gate. It does not replace hosted proof against the real public origin.

Run the hosted two-context browser QA against the deployed origin:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
npm.cmd run qa:hosted-browser
```

The hosted browser QA reuses the local browser flow without starting a local server. It checks setup status, starts a placeholder game, verifies board diagnostics, covers local save/resume UI, verifies corrupt-save handling, then hosts/joins/starts/rejoins a placeholder online match against the public origin.

## Render Sync Hook

The live Render service can be redeployed from a local secret hook without committing the hook URL:

```powershell
$env:POLITY_RENDER_SYNC_URL="<secret Render sync/deploy hook URL>"
npm.cmd run render:sync
```

The helper reads `POLITY_RENDER_SYNC_URL`, or `RENDER_DEPLOY_HOOK_URL` as a fallback, and redacts the `key` query parameter from its output. Do not commit the hook URL, paste it into docs, or put it in a tracked shell script. If the URL is exposed, regenerate the hook in Render.

After the sync starts and Render finishes deploying, rerun:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
$env:POLITY_EXPECTED_COMMIT="<short-or-full-git-sha>"
npm.cmd run smoke:hosted
npm.cmd run qa:hosted-browser
```

## Local Release Gate

- 2026-06-24: `npm.cmd run typecheck`, `npm.cmd run test -w app`, `npm.cmd run test -w server`, and `npm.cmd run smoke:multiplayer` passed from `imperium-like-digital-prototype` before hosted deployment.
- 2026-07-14: `npm.cmd run typecheck`, `npm.cmd run test -w app`, `npm.cmd run test -w server`, `npm.cmd run test -w engine`, `npm.cmd run smoke:fictional-game`, and `npm.cmd run smoke:multiplayer` passed from `imperium-like-digital-prototype` before hosted proof. `POLITY_HOSTED_BASE_URL=http://127.0.0.1:8794 npm.cmd run smoke:hosted` passed against a local production-style server. `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com npm.cmd run smoke:hosted` reached the host but `/polity/accounts/health` returned 404 on repeated attempts, so hosted proof is pending the actual deployed service origin or redeployment.
- 2026-07-21: Candidate deployment source is branch `agent/remaining-gaps-rules-playability`; last completed local-gate commit before hosted-prep docs/scripts was `6c4e891`. `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com npm.cmd run smoke:hosted` reached Render but `/polity/accounts/health` returned `404 Not Found`. `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com npm.cmd run qa:hosted-browser` also timed out waiting for `/polity/accounts/health` with `404 Not Found`. Hosted proof remains pending redeploying the selected branch or supplying the correct public origin.
- 2026-07-21: Render Blueprint hardening changed the build command to `npm ci && npm run build -w app && npm run typecheck` and declared an explicit service plan. The deployment candidate branch head was verified on GitHub at `2b74f8e`.
- 2026-07-21: Render Blueprint validation rejected `plan: free` because disks are not supported for free web services. The Blueprint now uses `plan: starter` to keep the persistent disk required for restart/storage proof.
- 2026-07-21: After pushing the Blueprint hardening checkpoint `46b984c`, `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com npm.cmd run smoke:hosted` still failed at `/polity/accounts/health` with `404 Not Found`. The code/config source is ready for Render, but public hosted proof still requires an authenticated Render deployment or the actual deployed public origin.
- 2026-07-21: Current deployment branch head is `a8acba8`. `npm.cmd run test:local-qa-scripts`, `npm.cmd run smoke:hosted:local`, and `npm.cmd run typecheck` passed locally. `https://polity-engine.onrender.com/polity/accounts/health` still returns `404 Not Found`, so real hosted proof remains open.
- 2026-07-22: Root `render.yaml` is present and declares the Render service shape described above. `npm.cmd run render:verify` passed locally: typecheck, server tests, and production app build completed. `npm.cmd run smoke:hosted` against `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com` still reaches the host but fails at `/polity/accounts/health` with `404 Not Found`. Hosted proof remains pending a redeploy of this service or the correct public origin.
- 2026-07-22: Next-gates work was committed and pushed to `origin/main` at `16bfa7c`. After the push, `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com npm.cmd run smoke:hosted` still returned `GET /polity/accounts/health failed with 404: Not Found`, so the candidate public origin is not yet serving the pushed Polity Engine service.
- 2026-07-22: After Render went live, `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com npm.cmd run smoke:hosted` passed and created/listed/cleaned up a hosted placeholder lobby. `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com npm.cmd run qa:hosted-browser` also passed, including setup, local board, worked-turn, automated practice, automated solo, two-seat online multiplayer self-play, viewport QA, save/resume, invalid save, and private-debug marker checks.
- 2026-07-22: Added `npm.cmd run render:sync` as a redacted local helper for the Render sync/deploy hook. The helper was run with `POLITY_RENDER_SYNC_URL` set locally and Render returned `201 Created`; `POLITY_HOSTED_BASE_URL=https://polity-engine.onrender.com npm.cmd run smoke:hosted` passed immediately afterward. A later route check showed the new admin-creation endpoint still returned `404 Not Found`, so this evidence only proved the host was healthy, not that the latest commit had deployed.
- 2026-07-22: Added `/polity/accounts/version`, deployment commit config, and `POLITY_EXPECTED_COMMIT` support in hosted smoke so future checks fail when the public app is alive but still serving an older commit.

## Hosted Gate Status

- 2026-07-14: Public hosting was intentionally deferred until later. `npm.cmd run qa:local-browser` remained the local browser QA gate while public hosting was unavailable.
- 2026-07-22: Hosted smoke and hosted browser QA now pass against `https://polity-engine.onrender.com`. Rerun `npm.cmd run smoke:hosted` and `npm.cmd run qa:hosted-browser` after future Render deploys.
- Current hosted evidence and private-gate handoff are summarized in `docs/hosted-release-handoff.md`.
