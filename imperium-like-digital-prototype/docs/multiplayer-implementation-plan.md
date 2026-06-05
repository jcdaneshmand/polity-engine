# Multiplayer Implementation Plan

Purpose: define the step-by-step implementation path for proper cross-client multiplayer in Polity Engine.

This plan assumes the existing `boardgame.io` engine remains the source of truth for game rules, while the app gains an online session mode backed by a server. "Proper multiplayer" means different browser clients can join the same match, submit authorized moves, reconnect after refresh, and receive only the game information they are allowed to know.

## Goals

- Support multiple clients connected to one shared match.
- Preserve the existing local game flow for solo, practice, and offline play.
- Use server-authoritative game state and move processing.
- Prevent private information leaks at the server boundary, not only in UI selectors.
- Support refresh/reconnect with stable match and player credentials.
- Persist active games beyond browser refresh and, eventually, server restart.
- Keep the implementation testable in small slices.

## Non-goals For The First Pass

- Public account system.
- Ranked matchmaking.
- Chat, timers, or async notifications.
- Cross-version save migration.
- Cloud-hosted private card data management.
- Mobile-first lobby polish beyond a usable responsive flow.

## Current Starting Point

- The engine already defines `PrototypeGame` as a `boardgame.io` game in `engine/src/game/game.ts`.
- The React app currently creates a local `boardgame.io` client in `app/src/App.tsx`.
- The UI already has presentation-level hidden-information helpers in `app/src/ui/layout/uiSelectors.ts`.
- There is no dedicated multiplayer server package, lobby flow, remote client transport, persistence, or server-side `playerView` redaction yet.

## Architecture

Add a third workspace package:

```text
imperium-like-digital-prototype/
  app/       React/Vite client
  engine/    Shared boardgame.io game and rules engine
  server/    boardgame.io multiplayer server
```

The server owns match state and move validation. The app can start either:

- Local mode: the current in-browser `Client(...)` path.
- Online mode: a remote `Client(...)` using Socket.IO transport, `matchID`, `playerID`, and credentials.

The engine owns rule behavior and private-state redaction helpers so both tests and server code use the same visibility rules.

## Phase 1: Design And Setup

### Tasks

- Add this plan document and keep it updated as implementation decisions settle.
- Define the first supported online mode:
  - 2-4 human multiplayer.
  - Simple room code / match ID.
  - Seat-based player identity.
  - Local/LAN development target first.
- Decide initial server storage:
  - In-memory for the first smoke test.
  - File or SQLite storage before calling the feature durable.
- Define production environment variables:
  - `POLITY_SERVER_PORT`
  - `POLITY_SERVER_ORIGIN`
  - `POLITY_STORAGE_PATH` or database URL
  - `VITE_MULTIPLAYER_SERVER_URL`

### Acceptance Criteria

- The implementation target is documented.
- Local play remains the default known-good path.
- Online play has an explicit first-pass scope.

## Phase 2: Server Package

### Tasks

- Create `imperium-like-digital-prototype/server`.
- Add `package.json`, `tsconfig.json`, and a TypeScript server entrypoint.
- Add the server package to the root workspaces.
- Register `PrototypeGame` with `boardgame.io/server`.
- Configure HTTP and Socket.IO transport.
- Configure CORS for the Vite dev origin.
- Add scripts:
  - `server:dev`
  - `server:typecheck`
  - optional root `dev:multiplayer`

### Acceptance Criteria

- The server starts locally on a configurable port.
- The server registers `polity-engine`.
- A minimal boardgame.io match can be created and connected to from a client.
- Existing engine tests still pass.

### Verification

- `npm run typecheck -w server`
- `npm run typecheck -w engine`
- `npm run test -w engine`

## Phase 3: Remote Client Mode

### Tasks

- Keep the existing local `Client(...)` path intact.
- Add an online session model containing:
  - `matchID`
  - `playerID`
  - credentials
  - server URL
  - setup summary
- Update app client construction to choose local or remote mode.
- Use Socket.IO multiplayer transport for online sessions.
- Show basic connection state in the game shell.

### Acceptance Criteria

- A local game still starts exactly as before.
- An online game can connect to a running local server.
- Two browser tabs can point at the same match and receive synchronized state.
- A move in one tab updates the other tab without manual refresh.

### Verification

- `npm run typecheck -w app`
- Manual two-tab smoke test.

## Phase 4: Lobby And Seat Flow

### Tasks

- Add setup actions:
  - Host Online Game.
  - Join Online Game.
  - Rejoin Previous Online Game when saved credentials exist.
- Implement match creation through the server lobby API.
- Store reconnect data in `localStorage`:

```ts
type OnlineSessionRecord = {
  matchID: string;
  playerID: string;
  credentials: string;
  serverURL: string;
  savedAt: string;
};
```

- Add join-by-code or join-by-link support.
- Show available seats and player names.
- Add a local "forget credentials" action.

### Acceptance Criteria

- Host can create a game and receive a shareable code/link.
- Another browser can join an open seat.
- Refreshing the browser offers rejoin.
- Rejoin uses the same player identity and credentials.

### Verification

- App tests for session record parsing and formatting.
- Manual host/join/rejoin flow.

## Phase 5: Server-Side Private Information

### Tasks

- Add `engine/src/game/playerView.ts`.
- Implement a redaction function used by `PrototypeGame.playerView`.
- Redact or mask data based on `playerID`.
- Treat `undefined` or spectator viewers as public-only.

Private or sensitive data to review:

- Other players' hands.
- Other players' private side areas.
- Hidden deck order.
- Hidden nation deck order.
- Bot hidden decks.
- Looked cards owned by another player.
- Pending choices for another player.
- Pending choice option lists that include private card IDs.
- Rollback snapshots embedded in pending state.
- Any future undo/history snapshots.
- Setup data that includes private imports or local file paths.

Recommended masking pattern:

- Preserve counts for hidden zones.
- Replace hidden card arrays with empty arrays or stable hidden placeholders only where the UI needs counts.
- Remove snapshots entirely from client-visible state.
- Keep public zones and current player's private zones visible.

### Acceptance Criteria

- No client receives another player's hidden card IDs.
- UI hidden-information selectors become defense-in-depth, not the main privacy boundary.
- Spectator/public view contains only public state.
- Online gameplay still has enough information for the active player to resolve legal choices.

### Verification

- Unit tests for `playerView`.
- Tests for each sensitive zone category.
- Regression test that serialized redacted state does not include known hidden card IDs.

## Phase 6: Move Authorization Audit

### Tasks

- Audit every move in `engine/src/game/moves.ts`.
- Confirm each move rejects when:
  - the wrong player submits it,
  - no matching pending choice exists,
  - the selected card is not in the allowed option list,
  - the game is over,
  - a blocking pending choice exists for another action.
- Add helpers if repeated authorization checks are drifting.
- Confirm `ctx.currentPlayer` is sufficient for normal turn moves.
- For reactive or out-of-turn choices, explicitly validate the pending choice owner.

### Acceptance Criteria

- Wrong-player actions cannot mutate game state.
- Invalid move attempts produce safe logs at most.
- Pending choices cannot be resolved by another seat.
- Tests cover representative normal moves and pending-choice moves.

### Verification

- Engine tests for cross-player illegal moves.
- Engine tests for pending choice ownership.
- Existing turn loop tests still pass.

## Phase 7: Persistence

### Tasks

- Choose initial durable storage:
  - File storage for simple local development, or
  - SQLite for a better long-term base.
- Configure boardgame.io storage.
- Store match metadata separately if needed for lobby listing.
- Ensure stored state is full authoritative state, not redacted player views.
- Ensure redaction happens only when sending state to clients.
- Add backup/deletion strategy for local development data.

### Acceptance Criteria

- Active matches survive browser refresh.
- Durable target matches survive server restart.
- Match metadata can be listed without leaking hidden data.

### Verification

- Create match, play move, restart server, reconnect.
- Confirm hidden data is still absent from client-visible payloads after reload.

## Phase 8: Reconnect And Resilience

### Tasks

- Add explicit disconnected/reconnecting/connected UI.
- Disable action controls while disconnected.
- Preserve unsent UI selections locally only when safe.
- Rejoin via saved credentials after refresh.
- Handle invalid or expired credentials with a clear return-to-lobby path.
- Add a server health or connection diagnostic message for development.

### Acceptance Criteria

- Refreshing a player browser returns to the same match.
- Temporary server disconnect does not corrupt client state.
- Invalid credentials do not expose match state.

### Verification

- Manual disconnect/reconnect test.
- Manual refresh during active turn.
- Manual refresh during pending choice.

## Phase 9: Multiplayer UX Polish

### Tasks

- Show room code and copyable join link.
- Show player seat labels and names.
- Show "You are Player N" in the game shell.
- Show whose turn it is.
- Disable or hide actions that cannot be submitted by the current viewer.
- Add spectator/read-only mode if useful for debugging.
- Keep local solo/practice setup uncluttered by online controls.

### Acceptance Criteria

- A new user can host and another user can join without reading developer docs.
- A rejoining player can tell which seat they occupy.
- Non-active players can inspect public state without accidentally attempting illegal moves.

### Verification

- Manual two-player usability pass.
- Browser viewport pass for setup/lobby and in-game shell.

## Phase 10: Deployment Preparation

### Tasks

- Document local development commands.
- Document hosted deployment requirements:
  - WebSocket-capable host.
  - Persistent storage.
  - Restricted CORS origin.
  - Server URL configured at app build time.
- Add production CORS defaults.
- Ensure server does not serve or expose private local file paths.
- Add logging for match creation, joins, disconnects, and server errors.

### Acceptance Criteria

- A developer can run the app and server locally from documented commands.
- Deployment configuration is explicit.
- Production defaults do not allow arbitrary origins unless intentionally configured.

## Test Matrix

### Engine

- `playerView` hides other players' hands.
- `playerView` hides hidden deck order.
- `playerView` hides hidden nation deck order.
- `playerView` hides looked cards from non-owner.
- `playerView` removes rollback snapshots.
- `playerView` preserves current player's actionable pending choice.
- Wrong player cannot play a card.
- Wrong player cannot end the current player's turn.
- Wrong player cannot resolve pending choices.
- Invalid card selections do not mutate state.

### App

- Local session still starts.
- Online session creates remote client with match identity.
- Rejoin record is saved, loaded, and cleared.
- Join link parses match ID correctly.
- Lobby renders host, join, and rejoin states.

### Server

- Server starts with registered game.
- Match creation accepts valid setup data.
- Match creation rejects invalid setup data.
- Client can join with credentials.
- Client cannot join or move with invalid credentials.
- Durable storage reloads a match after restart.

### Manual Browser

- Two tabs join the same match as different players.
- Player 0 move updates Player 1 tab.
- Player 1 cannot see Player 0 hand card IDs or names.
- Refresh Player 0 and rejoin.
- Restart server and reconnect after persistence is enabled.
- Pending choice flow works online.
- Spectator/public view sees only public information.

## Suggested Implementation Order

1. Add server package with in-memory storage.
2. Add online client path behind a simple manual match configuration.
3. Add host/join lobby flow.
4. Add server-side `playerView` redaction.
5. Add move authorization regression tests.
6. Add reconnect storage in the app.
7. Add durable server storage.
8. Polish online session UX.
9. Add deployment documentation and production config.

This order gets synchronized multiplayer working early, then hardens privacy, authorization, and persistence before presenting it as a complete feature.

## Risks And Mitigations

### Hidden Information Leaks

Risk: Full `GameState` contains private zones and snapshots.

Mitigation: Implement `playerView` before treating online play as usable. Add tests that search redacted JSON for hidden card IDs.

### Setup Data Drift

Risk: Client-created setup payloads can become invalid or malicious.

Mitigation: Validate setup data server-side before creating matches.

### Local And Online Paths Diverge

Risk: Fixes land in one client path but not the other.

Mitigation: Keep one shared session abstraction and one `PrototypeGame`; branch only at transport/client construction.

### Persistence Complexity

Risk: Durable storage introduces migration and cleanup needs.

Mitigation: Start in-memory for smoke tests, then add storage with an explicit version and local development cleanup command.

### Pending Choice Edge Cases

Risk: The engine has many pending choice types, some involving private card options.

Mitigation: Redact and test pending choices incrementally. Start with common card play/acquire/cleanup flows, then cover specialized effects.

## Definition Of Done

- Local play still works.
- Online host/join/rejoin works across two browser clients.
- Server-side `playerView` blocks hidden-information leaks.
- Wrong-player moves are rejected.
- Durable storage can recover a match after server restart.
- Typecheck passes for app, engine, and server.
- Engine test suite passes.
- Manual two-client smoke test passes.
- Local development and deployment commands are documented.
