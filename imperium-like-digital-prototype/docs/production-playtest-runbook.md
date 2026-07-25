# Production Playtest Runbook

Use this runbook when inviting players to the hosted Polity Engine app. Keep every captured issue public-safe: ask for diagnostics exports, screenshots, setup choices, and player expectations, but do not collect private CSVs, generated private JSON, private card names, or raw private card text.

## Pre-Invite Gate

Before sharing a playtest link:

1. Run the public-safe pre-private gate locally:

```powershell
npm.cmd run verify:pre-private
```

This covers local QA script tests, workspace typecheck, app tests, server tests, fictional-game smoke, multiplayer smoke, local browser QA, fatal/applyable private upload previews, save/recover, viewport checks, and private-debug marker checks without reading ignored private CSV rows.

2. Confirm the intended commit is pushed.
3. Trigger or confirm the Render deploy for that commit.
4. Run hosted smoke with commit proof:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
$env:POLITY_EXPECTED_COMMIT="<short-or-full-git-sha>"
npm.cmd run smoke:hosted
```

5. Run hosted browser QA after gameplay, board UI, lobby, account, admin, support, or diagnostics changes:

```powershell
$env:POLITY_HOSTED_BASE_URL="https://polity-engine.onrender.com"
npm.cmd run qa:hosted-browser
```

6. Confirm the deployment health and commit endpoint:
   - `GET /polity/accounts/health` returns `{ "ok": true }`.
   - `GET /polity/accounts/version` reports the expected commit.
7. Confirm public builds do not expose private debug markers and that the About page shows the development disclaimer plus one support button.

## Runtime Configuration

Render should run one Node web service from `imperium-like-digital-prototype`:

- Build command: `npm ci && npm run build -w app && npm run typecheck`
- Start command: `npm run start`
- Health check: `/polity/accounts/health`
- Public origin: `POLITY_SERVER_ORIGIN=https://polity-engine.onrender.com`
- Persistent storage: `POLITY_STORAGE_PATH=/var/data/polity-engine`
- Commit proof: Render commit metadata or `POLITY_BUILD_COMMIT`

Do not set `VITE_SHOW_PRIVATE_CARD_DEBUG=true` in production. Do not point `POLITY_STORAGE_PATH` at a public static directory.

## Persistent Storage

The persistent storage root contains:

- `boardgame/`: boardgame.io match state.
- `accounts.json`: account and session metadata.
- `lobby-matches.json`: running match metadata.
- `pregame-lobbies.json`: pregame lobby metadata.
- `support.json`: public monthly hosting-cost support state.

Before risky maintenance, use the Render shell or dashboard tools to copy the storage root to a private backup location. Treat the storage files as private operational data: they may include account emails, session tokens, room names, chat, and match metadata.

## Admin Account

The first registered account becomes admin. Admin accounts can also be created or updated through the admin account API when authenticated as an existing admin.

Admin abilities available in the UI:

- Clear all listed lobbies and games from Online Games.
- Close one pregame lobby.
- End one listed running game.
- Mark the current month as hosting-cost covered.

Admin API routes used by the app. These routes require a bearer token for an admin account:

- `POST /polity/lobby/admin/clear`
- `POST /polity/lobby/admin/close-lobby`
- `POST /polity/lobby/admin/close-match`
- `POST /polity/support/monthly/mark-covered`

Use targeted close/end first when only one room is stuck. Use clear-all only when the room list is noisy or the deployment is between playtest sessions.

## During A Playtest

Ask players to record:

- URL and approximate time.
- Browser and viewport.
- Mode, player count, Commons set, expansions, variants, and data source.
- Account or guest status, without passwords or tokens.
- Active player and viewer player.
- Exact action attempted.
- What they expected to happen.
- Visible blocked reason, error, or last event.
- Copied bug-report summary.
- Exported `polity-playtest-diagnostics-*.json`.
- Screenshot when layout, readability, or overlap is involved.

Players can submit a GitHub issue or email the bug description with the diagnostics file attached.

## Stuck Lobby Or Game Recovery

For one stale pregame lobby:

1. Sign in as admin.
2. Open Online Games.
3. Use `Close Lobby` on the affected lobby.
4. Refresh the room list and confirm it disappeared.

For one stale running game:

1. Sign in as admin.
2. Open Online Games.
3. Use `End Game` on the affected game.
4. Refresh the room list and confirm it disappeared.

For broad cleanup between sessions:

1. Sign in as admin.
2. Open Online Games.
3. Use `Clear All Games`.
4. Rerun hosted smoke if cleanup happened after a deploy or suspected storage issue.

If admin cleanup fails, preserve the visible error, download any relevant playtest diagnostics, then inspect Render logs and persistent storage before deleting files manually.

## After A Bug Report

1. Save only public-safe artifacts in the repository or issue tracker.
2. Reproduce the issue locally with placeholder data when possible.
3. Convert the reproduction into a scripted regression before changing engine or UI behavior.
4. If private data exposed the issue, recreate the behavior with a fictional card, fake bot table, or public-safe setup fixture.
5. Update the README gap snapshot or next-gates plan if the bug reopens a gate.

## Release Closeout

After each release:

1. Keep `README.md` and `docs/deployment.md` aligned with the live deployment behavior.
2. Record the commit used for hosted proof.
3. Run commit-pinned hosted smoke.
4. Run hosted browser QA for gameplay/UI/admin/support/diagnostics changes.
5. Confirm admin cleanup still works after any online-session change.
6. Keep Render deploy hooks, API keys, account tokens, and private CSV files out of committed docs and scripts.
