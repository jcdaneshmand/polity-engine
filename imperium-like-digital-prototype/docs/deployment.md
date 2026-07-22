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

## Storage Layout

`POLITY_STORAGE_PATH` is a root directory owned by the app:

- `boardgame/` stores boardgame.io FlatFile match state.
- `accounts.json` stores local account/session metadata.
- `lobby-matches.json` stores active match metadata.
- `pregame-lobbies.json` stores pregame lobby metadata.

Do not point `POLITY_STORAGE_PATH` at a public static directory.

## Render Blueprint

The repository root includes `render.yaml`. It defines one disk-compatible Node web service rooted at `imperium-like-digital-prototype`, a persistent disk mounted at `/var/data`, `POLITY_STORAGE_PATH=/var/data/polity-engine`, and a health check at `/polity/accounts/health`. Render does not support disks on free web services, so this service must use a paid plan such as `starter` for release proof.

Before creating a public deployment, set `POLITY_SERVER_ORIGIN` in Render to the deployed URL. Leave `VITE_SHOW_PRIVATE_CARD_DEBUG` unset or `false` for public builds.

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

The hosted smoke checks account health, the React app shell, lobby room listing, placeholder/fictional lobby creation, and absence of private-debug markers in the served app shell. After verifying the placeholder lobby appears in the room listing, it calls the lobby leave endpoint for cleanup.

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

## Deferred Hosted Gate

- 2026-07-14: Public hosting is intentionally deferred until later. Keep `npm.cmd run smoke:hosted` as the first hosted gate to run once an actual public origin exists, then complete the two-context browser QA before recording a hosted release gate.
- While public hosting is deferred, use `npm.cmd run qa:local-browser` as the local browser QA gate. It does not replace hosted proof; it keeps the browser multiplayer flow covered until a public origin exists.
- Current redeploy handoff and expected hosted evidence are summarized in `docs/hosted-release-handoff.md`.
