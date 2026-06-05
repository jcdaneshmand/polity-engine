# Pregame Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace immediate online match creation with pregame lobby rooms where players claim seats, choose nations, ready up, and the host starts the real game only after everyone is ready.

**Architecture:** Add a Polity lobby-room store and HTTP middleware on the server beside the existing started-match metadata. The app will use new lobby APIs, render a Lobby Room view, save lobby credentials before start, and continue using boardgame.io credentials only after start.

**Tech Stack:** TypeScript, React, Vite, boardgame.io server/client, Vitest.

---

## File Structure

- Create `server/src/pregameLobbyTypes.ts`: lobby room DTOs, input types, and error reason unions.
- Create `server/src/pregameLobbyStore.ts`: in-memory lobby room state, credential generation, readiness, cleanup, and public-safe projection.
- Create `server/src/pregameLobby.ts`: Koa-style routes for create/list/get/join/rejoin/update/select-nation/ready/start.
- Modify `server/src/index.ts`: mount pregame lobby middleware before the existing immediate-match middleware.
- Modify `app/src/onlineSession.ts`: add lobby API client functions and session-record variants.
- Create `app/src/ui/online/LobbyRoom.tsx`: lobby room UI for host setup, seat list, nation selection, ready, refresh, and start.
- Modify `app/src/ui/online/OnlineGames.tsx`: list lobby rooms and route host/join actions into lobby mode.
- Modify `app/src/App.tsx`: add `homeView: "lobby"`, saved lobby/session handling, polling, and transition to started online game.
- Add/update tests in `server/src/*.test.ts`, `app/src/onlineSession.test.ts`, `app/src/ui/online/*.test.tsx`, and `app/src/App.test.tsx`.

---

### Task 1: Server Lobby Room Store

**Files:**
- Create: `imperium-like-digital-prototype/server/src/pregameLobbyTypes.ts`
- Create: `imperium-like-digital-prototype/server/src/pregameLobbyStore.ts`
- Test: `imperium-like-digital-prototype/server/src/pregameLobbyStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Cover:
- creating a lobby occupies host seat `0`,
- public projection hides credentials/password/fingerprint,
- host setup changes clear ready states,
- player nation changes clear only that seat's ready state,
- lock occurs only when all seats are occupied, selected, and ready,
- empty unstarted lobby cleanup deletes after 10 minutes,
- started lobbies are not deleted by cleanup.

Run: `npm run test -w server -- pregameLobbyStore.test.ts`
Expected: fail because files do not exist.

- [ ] **Step 2: Implement lobby types and store**

Use stable string IDs and injectable `now`, `createID`, and `createCredential` functions for tests. Keep `privateDataFingerprint`, `passwordVerifier`, `lobbyCredentials`, and `playerCredentials` private.

- [ ] **Step 3: Verify store tests**

Run: `npm run test -w server -- pregameLobbyStore.test.ts`
Expected: pass.

---

### Task 2: Server Lobby Routes And Start Flow

**Files:**
- Create: `imperium-like-digital-prototype/server/src/pregameLobby.ts`
- Modify: `imperium-like-digital-prototype/server/src/index.ts`
- Test: `imperium-like-digital-prototype/server/src/pregameLobby.test.ts`

- [ ] **Step 1: Write failing route tests**

Cover:
- `POST /polity/lobby/rooms` creates a lobby without calling boardgame.io `createMatch`,
- `GET /polity/lobby/rooms` lists public-safe lobbies,
- `POST /rooms/:id/join` validates password and private-data fingerprint,
- `POST /rooms/:id/update-setup` is host-only and clears ready states,
- `POST /rooms/:id/select-nation` updates a seat and clears that seat's ready state,
- `POST /rooms/:id/ready` locks when all required seats are ready,
- `POST /rooms/:id/start` creates boardgame.io match and joins original seats,
- `POST /rooms/:id/spectate` is rejected before start.

Run: `npm run test -w server -- pregameLobby.test.ts`
Expected: fail because middleware does not exist.

- [ ] **Step 2: Implement route middleware**

Return JSON errors with specific codes: `lobby_not_found`, `wrong_password`, `private_data_mismatch`, `not_host`, `seat_unavailable`, `not_ready`, `spectation_unavailable`, `start_failed`.

- [ ] **Step 3: Mount middleware**

In `server/src/index.ts`, create the pregame store and mount `createPregameLobbyMiddleware` before the existing immediate-match middleware.

- [ ] **Step 4: Verify server tests**

Run: `npm run test -w server`
Expected: pass.

---

### Task 3: App Lobby API And Saved Sessions

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/onlineSession.ts`
- Test: `imperium-like-digital-prototype/app/src/onlineSession.test.ts`

- [ ] **Step 1: Write failing API utility tests**

Cover:
- creating/listing/joining/rejoining/updating/readying/starting lobbies uses `/polity/lobby/rooms`,
- lobby session records parse separately from started game records,
- non-JSON lobby response still reports a controlled error.

Run: `npm run test -w app -- onlineSession.test.ts`
Expected: fail on missing functions/types.

- [ ] **Step 2: Implement API utilities and session variants**

Add `ListedLobby`, `LobbyRoomDetails`, `OnlineLobbySessionRecord`, and functions:
`listLobbyRooms`, `createLobbyRoom`, `joinLobbyRoom`, `rejoinLobbyRoom`, `updateLobbySetup`, `selectLobbyNation`, `setLobbyReady`, `startLobbyGame`.

- [ ] **Step 3: Verify app utility tests**

Run: `npm run test -w app -- onlineSession.test.ts`
Expected: pass.

---

### Task 4: App Lobby Room UI

**Files:**
- Create: `imperium-like-digital-prototype/app/src/ui/online/LobbyRoom.tsx`
- Test: `imperium-like-digital-prototype/app/src/ui/online/LobbyRoom.test.tsx`
- Modify as needed: `imperium-like-digital-prototype/app/src/ui/styles/setup.css`

- [ ] **Step 1: Write failing UI tests**

Cover:
- renders lobby room title, seats, setup summary, nation controls, ready button,
- host sees setup controls and Start Game when locked,
- non-host does not see host setup controls,
- spectate action is absent before start.

Run: `npm run test -w app -- LobbyRoom.test.tsx`
Expected: fail because component does not exist.

- [ ] **Step 2: Implement LobbyRoom**

Keep the layout consistent with `OnlineGames.tsx`: compact setup-stage sections, no nested cards, no server URL.

- [ ] **Step 3: Verify component tests**

Run: `npm run test -w app -- LobbyRoom.test.tsx`
Expected: pass.

---

### Task 5: Wire App Host/Join/Rejoin/Start Flow

**Files:**
- Modify: `imperium-like-digital-prototype/app/src/App.tsx`
- Modify: `imperium-like-digital-prototype/app/src/ui/online/OnlineGames.tsx`
- Test: `imperium-like-digital-prototype/app/src/App.test.tsx`
- Test: `imperium-like-digital-prototype/app/src/ui/online/OnlineGames.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Cover:
- Online Games host action opens a lobby room, not a boardgame.io game,
- lobby cards show Join Lobby instead of Join Seat,
- saved lobby sessions render as pregame rejoin,
- starting a lobby transitions into online player mode.

Run: `npm run test -w app`
Expected: fail on old immediate-match assumptions.

- [ ] **Step 2: Update OnlineGames**

Add lobby list rows and keep started game rows. Host and join-by-code should call lobby APIs.

- [ ] **Step 3: Update App state machine**

Add `homeView === "lobby"`, store current lobby details/session, refresh lobby details on demand, and call `startOnlineSession` only after `startLobbyGame`.

- [ ] **Step 4: Verify app tests**

Run: `npm run test -w app`
Expected: pass.

---

### Task 6: Verification And Commit

**Files:**
- Include spec: `imperium-like-digital-prototype/docs/superpowers/specs/2026-06-05-pregame-lobby-design.md`
- Include plan: `imperium-like-digital-prototype/docs/superpowers/plans/2026-06-05-pregame-lobby-implementation.md`
- Include all changed app/server files.

- [ ] **Step 1: Run full verification**

Run:
- `npm run typecheck`
- `npm run test -w server`
- `npm run test -w app`
- `npm run test -w engine`
- `npm run build -w app`

Expected: all pass, except the existing Vite large chunk warning may remain.

- [ ] **Step 2: Run live smoke**

Start server and Vite with the dev proxy. Smoke:
- create lobby,
- join second browser/client,
- select nations,
- ready both seats,
- confirm setup locks,
- start game,
- confirm original credentials are returned,
- confirm pregame spectate is rejected,
- confirm empty unstarted lobby cleanup with a fake-clock unit test.

- [ ] **Step 3: Commit**

Run:
```powershell
git add -- imperium-like-digital-prototype/docs/superpowers/specs/2026-06-05-pregame-lobby-design.md imperium-like-digital-prototype/docs/superpowers/plans/2026-06-05-pregame-lobby-implementation.md imperium-like-digital-prototype/server/src imperium-like-digital-prototype/app/src imperium-like-digital-prototype/app/vite.config.ts
git commit -m "feat: add pregame online lobbies"
```

Expected: clean worktree after commit.

---

## Self-Review

- Spec coverage: the tasks cover lobby creation, player join/rejoin, host setup changes, readiness, nation selection, start flow, cleanup, post-start spectation only, original-player rejoin, and verification.
- Placeholder scan: no TODO/TBD placeholders; every task has files, tests, commands, and expected outcomes.
- Type consistency: lobby IDs, lobby credentials, started match IDs, seat IDs, and player credentials are named consistently across server and app tasks.
