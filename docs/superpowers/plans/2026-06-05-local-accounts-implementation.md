# Local Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement local server accounts with admin authorization, guest restrictions, account-backed game history, and stratified solo/online/nation stats.

**Architecture:** Add a server-side account store that owns users, sessions, history, persistence, and stat updates. Expose account HTTP endpoints through a focused middleware, then consume them from the React app with a small account client and account panel. Protect chat/admin routes by resolving optional or required account sessions at the server boundary.

**Tech Stack:** TypeScript, React, boardgame.io, Koa-like boardgame.io server middleware, Node `crypto`, local JSON persistence, Vitest.

---

## File Structure

- Create `imperium-like-digital-prototype/server/src/accountTypes.ts` for account, session, history, and stats types.
- Create `imperium-like-digital-prototype/server/src/accountStore.ts` for account creation, sign-in, session resolution, JSON persistence, history, and stats.
- Create `imperium-like-digital-prototype/server/src/accountStore.test.ts` for store unit tests.
- Create `imperium-like-digital-prototype/server/src/accounts.ts` for account HTTP endpoints and auth helpers.
- Create `imperium-like-digital-prototype/server/src/accounts.test.ts` for endpoint tests.
- Modify `imperium-like-digital-prototype/server/src/serverConfig.ts` to expose an account storage path derived from `POLITY_STORAGE_PATH`.
- Modify `imperium-like-digital-prototype/server/src/index.ts` to instantiate the account store and mount account middleware before lobby middleware.
- Modify `imperium-like-digital-prototype/server/src/pregameLobby.ts` so chat requires an account and admin clear requires an admin account.
- Modify `imperium-like-digital-prototype/server/src/pregameLobby.test.ts` for protected chat/admin tests.
- Create `imperium-like-digital-prototype/app/src/accountSession.ts` for browser session token storage and account helper types.
- Create `imperium-like-digital-prototype/app/src/accountSession.test.ts`.
- Modify `imperium-like-digital-prototype/app/src/onlineSession.ts` for account API helpers and account-aware chat/admin requests.
- Modify `imperium-like-digital-prototype/app/src/onlineSession.test.ts`.
- Create `imperium-like-digital-prototype/app/src/ui/online/AccountPanel.tsx`.
- Create `imperium-like-digital-prototype/app/src/ui/online/AccountPanel.test.tsx`.
- Modify `imperium-like-digital-prototype/app/src/ui/online/OnlineGames.tsx` to render account state and enforce guest restrictions.
- Modify `imperium-like-digital-prototype/app/src/ui/online/LobbyRoom.tsx` to disable lobby chat for guests.
- Modify `imperium-like-digital-prototype/app/src/App.tsx` to load account state, pass tokens, and report game starts/results.
- Modify `imperium-like-digital-prototype/app/src/ui/layout/EndGameSummary.tsx` or `BoardLayout.tsx` only if needed to expose a single result-reporting callback.

---

### Task 1: Server Account Types And Store

**Files:**
- Create: `imperium-like-digital-prototype/server/src/accountTypes.ts`
- Create: `imperium-like-digital-prototype/server/src/accountStore.ts`
- Test: `imperium-like-digital-prototype/server/src/accountStore.test.ts`

- [ ] **Step 1: Write failing account store tests**

Create tests for first-account admin bootstrap, duplicate email/username, sign-in sessions, idempotent result recording, online/solo stats, campaign/practice stats, and per-nation stats.

Run: `..\.codex-tools\npm.cmd run test -w server -- accountStore.test.ts`

Expected: FAIL because `accountStore.ts` does not exist.

- [ ] **Step 2: Add account types**

Define `AccountRole`, `AccountPublicView`, `AccountStats`, `GameHistoryEntry`, `GameResultInput`, and `AccountStoreSnapshot`. Use the stat shape from `docs/superpowers/specs/2026-06-05-local-accounts-design.md`.

- [ ] **Step 3: Implement in-memory account store**

Use Node `crypto.scryptSync` or `pbkdf2Sync` with per-password salt. Store only password hashes and token hashes. Implement:

- `createAccount({ email, username, password })`
- `signIn({ login, password })`
- `signOut(token)`
- `resolveSession(token)`
- `recordGameStart(accountID, entry)`
- `recordGameResult(accountID, input)`
- `toPublicAccount(account)`

Result recording must be idempotent by history entry ID and must update aggregate and `byNation` stats exactly once.

- [ ] **Step 4: Run store tests to green**

Run: `..\.codex-tools\npm.cmd run test -w server -- accountStore.test.ts`

Expected: PASS.

---

### Task 2: Server Account HTTP Middleware

**Files:**
- Create: `imperium-like-digital-prototype/server/src/accounts.ts`
- Test: `imperium-like-digital-prototype/server/src/accounts.test.ts`
- Modify: `imperium-like-digital-prototype/server/src/index.ts`
- Modify: `imperium-like-digital-prototype/server/src/serverConfig.ts`

- [ ] **Step 1: Write failing endpoint tests**

Cover:

- `POST /polity/accounts/register`
- `POST /polity/accounts/sign-in`
- `POST /polity/accounts/sign-out`
- `GET /polity/accounts/me`
- `GET /polity/accounts/history`
- `POST /polity/accounts/history/start`
- `POST /polity/accounts/history/result`

Run: `..\.codex-tools\npm.cmd run test -w server -- accounts.test.ts`

Expected: FAIL because `accounts.ts` does not exist.

- [ ] **Step 2: Implement account middleware**

Use the same Koa-like style as `pregameLobby.ts`: local `readJSONBody`, `setError`, and route matching. Accept bearer tokens from `Authorization: Bearer <token>`.

Responses:

- Register/sign-in returns `{ account, token }`.
- Me returns `{ account }` or `401`.
- History returns `{ history, stats }`.
- Start returns `{ entry }`.
- Result returns `{ entry, stats }`.

- [ ] **Step 3: Add auth helpers**

Export:

- `bearerToken(ctx)`
- `resolveOptionalAccount(ctx, store)`
- `requireAccount(ctx, store)`
- `requireAdmin(ctx, store)`

These helpers will be reused by lobby middleware.

- [ ] **Step 4: Wire server config and index**

Add an account store path. When `POLITY_STORAGE_PATH` exists, use a file like `<POLITY_STORAGE_PATH>/accounts.json`. In dev without storage path, use an in-memory store for now so tests and `dev:full` do not create untracked files.

Mount `createAccountMiddleware({ store: accountStore })` before lobby middleware.

- [ ] **Step 5: Run endpoint tests to green**

Run: `..\.codex-tools\npm.cmd run test -w server -- accounts.test.ts serverConfig.test.ts`

Expected: PASS.

---

### Task 3: Protect Chat And Admin Clear

**Files:**
- Modify: `imperium-like-digital-prototype/server/src/pregameLobby.ts`
- Test: `imperium-like-digital-prototype/server/src/pregameLobby.test.ts`
- Modify if needed: `imperium-like-digital-prototype/server/src/index.ts`

- [ ] **Step 1: Write failing protection tests**

Update pregame lobby middleware tests so:

- Guest lounge chat returns `401`.
- Signed-in account lounge chat succeeds and uses account username.
- Guest lobby chat returns `401`.
- Signed-in account lobby chat succeeds and uses account username.
- Guest admin clear returns `401`.
- Signed-in non-admin admin clear returns `403`.
- Signed-in admin clear succeeds.

Run: `..\.codex-tools\npm.cmd run test -w server -- pregameLobby.test.ts`

Expected: FAIL because chat/admin do not require account sessions.

- [ ] **Step 2: Add optional account store dependency**

Extend `createPregameLobbyMiddleware` options with `accountStore?: AccountStore`.

- [ ] **Step 3: Require account/admin sessions**

For `/polity/lobby/chat` and `/polity/lobby/rooms/:id/chat/send`, require account. Use the public account username as the chat author.

For `/polity/lobby/admin/clear`, require admin.

- [ ] **Step 4: Run protected route tests**

Run: `..\.codex-tools\npm.cmd run test -w server -- pregameLobby.test.ts accounts.test.ts`

Expected: PASS.

---

### Task 4: App Account Client And Storage

**Files:**
- Create: `imperium-like-digital-prototype/app/src/accountSession.ts`
- Test: `imperium-like-digital-prototype/app/src/accountSession.test.ts`
- Modify: `imperium-like-digital-prototype/app/src/onlineSession.ts`
- Test: `imperium-like-digital-prototype/app/src/onlineSession.test.ts`

- [ ] **Step 1: Write failing app helper tests**

Cover account token storage, account parsing, register/sign-in/sign-out/me/history/start/result helpers, bearer header attachment, account-required chat, and admin clear with token.

Run: `..\.codex-tools\npm.cmd exec vitest -- run --config app/vite.config.ts app/src/accountSession.test.ts app/src/onlineSession.test.ts`

Expected: FAIL because account helpers do not exist.

- [ ] **Step 2: Implement account session storage**

Use `polity-engine.accountSession.v1` in localStorage. Store `{ token, account }`.

- [ ] **Step 3: Implement account HTTP helpers**

Add helpers:

- `registerAccount`
- `signInAccount`
- `signOutAccount`
- `loadCurrentAccount`
- `listAccountHistory`
- `startAccountGameHistory`
- `recordAccountGameResult`

Extend `sendOnlineChat`, `sendLobbyChat`, and `clearAllOnlineGames` to accept `accountToken`.

- [ ] **Step 4: Run app helper tests**

Run: `..\.codex-tools\npm.cmd exec vitest -- run --config app/vite.config.ts app/src/accountSession.test.ts app/src/onlineSession.test.ts`

Expected: PASS.

---

### Task 5: Account UI And Guest Restrictions

**Files:**
- Create: `imperium-like-digital-prototype/app/src/ui/online/AccountPanel.tsx`
- Test: `imperium-like-digital-prototype/app/src/ui/online/AccountPanel.test.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/online/OnlineGames.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/online/OnlineGames.test.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/online/LobbyRoom.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/online/LobbyRoom.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Cover:

- Guest account panel shows create/sign-in controls.
- Signed-in panel shows username and sign-out.
- Admin panel shows admin badge.
- Guest online chat disabled.
- Guest lobby chat disabled.
- Admin clear hidden unless account role is `admin`.

Run: `..\.codex-tools\npm.cmd exec vitest -- run --config app/vite.config.ts app/src/ui/online/AccountPanel.test.tsx app/src/ui/online/OnlineGames.test.tsx app/src/ui/online/LobbyRoom.test.tsx`

Expected: FAIL because UI has no account panel or account-aware props.

- [ ] **Step 2: Implement `AccountPanel`**

Use compact fields for email, username, password, sign in, create account, and sign out. Keep the panel work-focused and consistent with existing setup controls.

- [ ] **Step 3: Wire OnlineGames props**

Add props for `account`, account actions, and `accountRequiredMessage`. Hide `Clear All Games` unless `account.role === "admin"`. Disable chat for guests.

- [ ] **Step 4: Wire LobbyRoom chat restriction**

Add `canChat` or `account` prop. Disable chat input/send for guests.

- [ ] **Step 5: Run UI tests**

Run: `..\.codex-tools\npm.cmd exec vitest -- run --config app/vite.config.ts app/src/ui/online/AccountPanel.test.tsx app/src/ui/online/OnlineGames.test.tsx app/src/ui/online/LobbyRoom.test.tsx`

Expected: PASS.

---

### Task 6: App Account State Integration

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/App.tsx`
- Test: existing app tests plus focused helper/UI tests.

- [ ] **Step 1: Add account state**

On app load, restore local account session and call `/polity/accounts/me`. If token is invalid, clear local account state.

- [ ] **Step 2: Wire register/sign-in/sign-out**

Register and sign-in save `{ token, account }`. Sign-out calls server and clears local state.

- [ ] **Step 3: Pass token to protected APIs**

Use account token for online chat, lobby chat, and admin clear. Guests see disabled chat and no clear button.

- [ ] **Step 4: Run focused app tests and typecheck**

Run:

- `..\.codex-tools\npm.cmd exec vitest -- run --config app/vite.config.ts app/src/onlineSession.test.ts app/src/ui/online/AccountPanel.test.tsx app/src/ui/online/OnlineGames.test.tsx app/src/ui/online/LobbyRoom.test.tsx`
- `..\.codex-tools\npm.cmd run typecheck`

Expected: PASS.

---

### Task 7: Account-Backed History And Stats Reporting

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/App.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/BoardLayout.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/layout/EndGameSummary.tsx`
- Test: add or update relevant app tests.

- [ ] **Step 1: Write failing result extraction tests**

Add tests for extracting a result payload from `G.gameover`, including nation ID, winner ID, scores, tie-break scores, round, and solo variant.

Run: `..\.codex-tools\npm.cmd exec vitest -- run --config app/vite.config.ts app/src/ui/layout/EndGameSummary.test.tsx`

Expected: FAIL until result extraction exists.

- [ ] **Step 2: Add result extraction helper**

Create or export a helper that accepts `{ G, playerID, scope, variant }` and returns the account game result payload. Keep the helper pure and testable.

- [ ] **Step 3: Report solo game start**

When a signed-in user starts a local solo game, call account history start with `scope: "solo"` and the correct variant: `standard`, `campaign`, or `practice`.

- [ ] **Step 4: Report online game start/resume**

When a signed-in user hosts/joins an online lobby or match, call account history start with `scope: "online"` and `variant: "multiplayer"`.

- [ ] **Step 5: Report completed results once**

When `G.gameover` is visible through the end-game summary, send a result update once per history entry. Use server idempotency to protect refresh/double-render.

- [ ] **Step 6: Run result tests**

Run:

- `..\.codex-tools\npm.cmd exec vitest -- run --config app/vite.config.ts app/src/ui/layout/EndGameSummary.test.tsx`
- `..\.codex-tools\npm.cmd run test -w server -- accountStore.test.ts accounts.test.ts`

Expected: PASS.

---

### Task 8: Full Verification

**Files:**
- No new files expected.

- [ ] **Step 1: Run server tests**

Run: `..\.codex-tools\npm.cmd run test -w server`

Expected: all server tests pass.

- [ ] **Step 2: Run focused app tests**

Run: `..\.codex-tools\npm.cmd exec vitest -- run --config app/vite.config.ts app/src/accountSession.test.ts app/src/onlineSession.test.ts app/src/ui/online/AccountPanel.test.tsx app/src/ui/online/OnlineGames.test.tsx app/src/ui/online/LobbyRoom.test.tsx app/src/ui/layout/EndGameSummary.test.tsx`

Expected: all focused app tests pass.

- [ ] **Step 3: Run typecheck**

Run: `..\.codex-tools\npm.cmd run typecheck`

Expected: engine, app, and server TypeScript checks pass.

- [ ] **Step 4: Run dev-full tests**

Run: `node --test ..\scripts\dev-full.test.mjs`

Expected: all dev-full controller tests pass.

---

## Self-Review

- Spec coverage: accounts, sessions, guest restrictions, admin role, history, solo standard/campaign/practice stats, online stats, and per-nation stats all map to tasks.
- Placeholder scan: no `TBD`, `TODO`, or "similar to" implementation shortcuts are present.
- Type consistency: `AccountStats`, `GameHistoryEntry`, `GameResultInput`, and account token names are consistent across server, client helpers, and UI tasks.
