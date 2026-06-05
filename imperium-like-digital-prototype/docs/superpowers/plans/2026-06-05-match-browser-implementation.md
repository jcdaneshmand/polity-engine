# Match Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Online Games hub with listed matches, locked-game password gates, exact private-data fingerprint compatibility, saved rejoin, and read-only spectator entry.

**Architecture:** Keep `boardgame.io` authoritative for match state and add a small Polity lobby layer on the server for product metadata and access gates. The app consumes that layer through `onlineSession.ts` and renders a dedicated `OnlineGames` hub that starts player or spectator sessions without exposing a server URL.

**Tech Stack:** TypeScript, React, Vite, boardgame.io, Socket.IO, Koa middleware style server code, Vitest.

---

## File Structure

- Create `server/src/lobbyTypes.ts`: shared server lobby types and request shapes.
- Create `server/src/lobbyStore.ts`: in-memory lobby metadata store, password verifier helpers, fingerprint gates, row sorting.
- Create `server/src/polityLobby.ts`: Koa middleware for Polity lobby endpoints.
- Create `server/src/lobbyStore.test.ts`: unit tests for metadata, password gates, fingerprint gates, and sorting.
- Create `server/src/polityLobby.test.ts`: route-level middleware tests.
- Modify `server/src/index.ts`: mount the Polity lobby before the static app middleware.
- Modify `app/src/onlineSession.ts`: add online lobby API client, fingerprinting, richer saved session records, row sorting helpers.
- Modify `app/src/onlineSession.test.ts`: add red/green coverage for fingerprinting, listed match parsing, locked join/spectate requests, and sorting.
- Create `app/src/ui/online/OnlineGames.tsx`: action-first Online Games hub.
- Create `app/src/ui/online/OnlineGames.test.tsx`: render and interaction tests for hub sections.
- Modify `app/src/App.tsx`: add `online` home view, player/spectator online sessions, and route Online Games actions into boardgame.io clients.
- Modify `app/src/ui/setup/NewGameSetup.tsx`: remove embedded online controls and provide a simple entry point into Online Games.
- Modify `app/src/ui/setup/NewGameSetupSummary.test.tsx`: update expectations for the setup online entry point.
- Modify `app/src/ui/styles/setup.css`: add Online Games layout styles and spectator shell state.

## Task 1: Server Lobby Model And Store

- [ ] **Step 1: Write failing lobby store tests**

Add tests in `server/src/lobbyStore.test.ts` for:

```ts
import { describe, expect, it } from "vitest";
import { createLobbyStore } from "./lobbyStore";

describe("lobby store", () => {
  it("lists locked games without leaking password verifiers", async () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z", hashPassword: (value) => `hash:${value}` });
    store.createMatchMetadata({
      matchID: "match-1",
      roomName: "Locked Table",
      playerCount: 2,
      setupData: { options: { commonsSetId: "classics", enabledExpansions: [], enabledVariants: [] }, playerNationIds: { "1": "Sun Coast", "2": "River League" } },
      privateDataFingerprint: "private:abc",
      password: "swordfish"
    });
    expect(store.listMatches()).toEqual([
      expect.objectContaining({ matchID: "match-1", roomName: "Locked Table", isLocked: true, privateDataLabel: "private_data_required" })
    ]);
    expect(JSON.stringify(store.listMatches())).not.toContain("swordfish");
    expect(JSON.stringify(store.listMatches())).not.toContain("hash:swordfish");
  });

  it("validates passwords and private data fingerprints before access", () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z", hashPassword: (value) => `hash:${value}` });
    store.createMatchMetadata({ matchID: "match-1", roomName: "Locked", playerCount: 2, setupData: {}, privateDataFingerprint: "fp-a", password: "pw" });
    expect(store.validateAccess({ matchID: "match-1", password: "wrong", privateDataFingerprint: "fp-a" })).toEqual({ ok: false, reason: "wrong_password" });
    expect(store.validateAccess({ matchID: "match-1", password: "pw", privateDataFingerprint: "fp-b" })).toEqual({ ok: false, reason: "private_data_mismatch" });
    expect(store.validateAccess({ matchID: "match-1", password: "pw", privateDataFingerprint: "fp-a" })).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run server tests and verify the new tests fail**

Run: `npm run test -w server -- src/lobbyStore.test.ts`

Expected: fails because `lobbyStore` does not exist.

- [ ] **Step 3: Implement `lobbyTypes.ts` and `lobbyStore.ts`**

Implement public-safe `ListedMatch`, private metadata, `createLobbyStore`, `createMatchMetadata`, `listMatches`, `recordPlayerJoin`, `markMatchInProgress`, and `validateAccess`.

- [ ] **Step 4: Run server tests and verify they pass**

Run: `npm run test -w server -- src/lobbyStore.test.ts`

Expected: all lobby store tests pass.

## Task 2: Server Lobby Routes

- [ ] **Step 1: Write failing route tests**

Add `server/src/polityLobby.test.ts` that exercises middleware directly:

- `GET /polity/lobby/matches` returns listed matches.
- `POST /polity/lobby/matches` creates metadata and delegates to a fake boardgame create function.
- `POST /polity/lobby/matches/:matchID/join` rejects wrong password and delegates on success.
- `POST /polity/lobby/matches/:matchID/spectate` returns spectator credentials after gates pass.

- [ ] **Step 2: Run route tests and verify failure**

Run: `npm run test -w server -- src/polityLobby.test.ts`

Expected: fails because `polityLobby` does not exist.

- [ ] **Step 3: Implement `polityLobby.ts`**

Create Koa-style middleware for:

- `GET /polity/lobby/matches`
- `POST /polity/lobby/matches`
- `POST /polity/lobby/matches/:matchID/join`
- `POST /polity/lobby/matches/:matchID/spectate`

Use boardgame.io-compatible HTTP delegation by calling local handlers through injected functions in tests and `fetch` against same-origin boardgame.io endpoints in production.

- [ ] **Step 4: Mount middleware**

Modify `server/src/index.ts` to create one store and mount `createPolityLobbyMiddleware(...)` before static app serving.

- [ ] **Step 5: Run server tests**

Run: `npm run test -w server`

Expected: all server tests pass.

## Task 3: App Online API And Fingerprints

- [ ] **Step 1: Write failing app utility tests**

Extend `app/src/onlineSession.test.ts` for:

- canonical private-data fingerprint stability across object key order,
- placeholder fingerprint when no private data is loaded,
- `listOnlineMatches`,
- `createPolityOnlineMatch`,
- `joinPolityOnlineMatch`,
- `spectateOnlineMatch`,
- public match sorting.

- [ ] **Step 2: Run utility tests and verify failure**

Run: `npm run test -w app -- src/onlineSession.test.ts`

Expected: fails because new exports do not exist.

- [ ] **Step 3: Implement utility exports in `onlineSession.ts`**

Add types `ListedMatch`, `PrivateDataLabel`, `OnlineSessionKind`, `OnlineSessionRecord.kind`, `computePrivateDataFingerprint`, `listOnlineMatches`, `createPolityOnlineMatch`, `joinPolityOnlineMatch`, `spectateOnlineMatch`, and `sortListedMatches`.

- [ ] **Step 4: Run utility tests**

Run: `npm run test -w app -- src/onlineSession.test.ts`

Expected: tests pass.

## Task 4: Online Games Hub UI

- [ ] **Step 1: Write failing hub tests**

Create `app/src/ui/online/OnlineGames.test.tsx` covering:

- renders Resume, Host Game, Join By Code, and Browse Games sections,
- locked matches show a password field before join/spectate,
- public matches expose join/spectate actions,
- private-data mismatch disables join and spectate,
- host action includes room name, optional password, and fingerprint.

- [ ] **Step 2: Run hub tests and verify failure**

Run: `npm run test -w app -- src/ui/online/OnlineGames.test.tsx`

Expected: fails because `OnlineGames` does not exist.

- [ ] **Step 3: Implement `OnlineGames.tsx`**

Build an action-first hub with props for saved sessions, matches, current setup config, current private-data fingerprint, and callbacks for host/join/spectate/rejoin/refresh/open setup.

- [ ] **Step 4: Add styles**

Extend `app/src/ui/styles/setup.css` with `.online-games-*` styles using the existing restrained setup palette and responsive grids.

- [ ] **Step 5: Run hub tests**

Run: `npm run test -w app -- src/ui/online/OnlineGames.test.tsx`

Expected: tests pass.

## Task 5: App Integration

- [ ] **Step 1: Write or update integration tests**

Update `app/src/App.test.tsx` and `app/src/ui/setup/NewGameSetupSummary.test.tsx` to expect an Online Games entry point rather than embedded host/join controls.

- [ ] **Step 2: Run app tests and verify failure**

Run: `npm run test -w app`

Expected: fails until App and setup integration are updated.

- [ ] **Step 3: Modify App integration**

Update `App.tsx` to:

- add `homeView: "online"`,
- load listed matches,
- create/join/spectate through Polity lobby APIs,
- store player rejoin records,
- create spectator sessions with read-only UI state,
- keep local game startup unchanged.

- [ ] **Step 4: Simplify setup online controls**

Update `NewGameSetup.tsx` props to use `onOpenOnlineGames` and remove embedded match ID/seat/password controls.

- [ ] **Step 5: Run app tests**

Run: `npm run test -w app`

Expected: all app tests pass.

## Task 6: Verification, Commit, Merge

- [ ] **Step 1: Run full verification**

Run:

- `npm run typecheck`
- `npm run test -w server`
- `npm run test -w app`
- `npm run test -w engine`
- `npm run build -w app`

Expected: all pass, except existing Vite chunk-size warning is acceptable.

- [ ] **Step 2: Commit implementation**

Stage only intended files and commit: `feat: add online match browser`.

- [ ] **Step 3: Merge main safely**

Fetch is not required unless explicitly requested. Switch to `main`, merge `codex/multiplayer-foundation`, resolve conflicts by preserving verified match-browser behavior and any non-conflicting main changes, rerun verification, then commit the merge if needed.

