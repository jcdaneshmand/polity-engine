# Match Browser Design

Date: 2026-06-05

## Purpose

Polity Engine needs a fully featured online match browser so cross-client multiplayer is discoverable and usable without exposing a server URL or requiring manual match setup. The browser should make it easy to host, join, rejoin, and spectate games while preserving hidden-information boundaries and ensuring all clients use compatible game data.

## Product Decisions

- Add a dedicated Online Games hub instead of continuing to expand the current New Game setup panel.
- Use an action-first layout:
  - saved/rejoinable games,
  - host a game,
  - join by code or password,
  - browse listed games,
  - spectate eligible games.
- List all host-created games in the match browser by default.
- Open games are joinable or spectatable without a password.
- Private games still appear in the list, but show a locked state and require the room password/code to join or spectate.
- Rejoining a previously joined seat uses saved credentials and does not require re-entering the password.
- Do not add accounts or profiles in this version. Players use anonymous display names stored locally with reconnect credentials.
- Normal users should not see or type a server URL. The hosted app should use its own origin for lobby and Socket.IO traffic, with environment overrides only for split app/API deployments.

## Non-Goals

- User accounts, friends lists, avatars, or persistent profiles.
- Ranked matchmaking.
- Chat, timers, notifications, or invitations beyond copyable room codes/links.
- Fuzzy private-data compatibility. Multiplayer requires exact data compatibility.
- Late joining an in-progress game as a player.

## Architecture

Keep `boardgame.io` as the game authority and add a thin Polity lobby layer in the server.

### Responsibilities

The `engine` package remains responsible for:

- game rules,
- move validation,
- server-side `playerView` redaction,
- spectator/public view behavior.

The `server` package becomes responsible for:

- Polity-specific lobby metadata,
- listed-match browsing,
- password-protected match access,
- private-data fingerprint checks,
- creating and joining boardgame.io matches,
- authorizing spectator access,
- serving the built app from the same origin.

The `app` package becomes responsible for:

- Online Games hub UI,
- local reconnect/session storage,
- private-data fingerprint calculation,
- host/join/spectate flows,
- rendering player mode or spectator mode.

## Lobby Metadata

Lobby list responses must only include public-safe metadata:

```ts
type ListedMatch = {
  matchID: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  status: "setup" | "in_progress" | "ended";
  playerCount: number;
  occupiedSeats: Array<{
    playerID: string;
    playerName: string;
    isConnected: boolean;
  }>;
  availableSeats: string[];
  isLocked: boolean;
  spectatingAllowed: boolean;
  privateDataLabel: "placeholder" | "private_data_required";
  setupSummary: {
    commonsSetId: string;
    enabledExpansions: string[];
    enabledVariants: string[];
    nationLabels: string[];
  };
};
```

List responses must not include:

- room passwords,
- password hashes/verifiers,
- player credentials,
- full setup data with private imports,
- hidden game state,
- local file names or paths.

## Password-Protected Games

Private games are password-protected listed games, not hidden rooms.

Host flow:

1. Host enters an optional room password.
2. Server stores only a password verifier or hash.
3. The match appears in the public list with `isLocked: true`.
4. Joining or spectating requires the password.

Access rules:

- Wrong password is rejected before issuing player or spectator credentials.
- Correct password allows seat selection or spectation if the other gates pass.
- Saved player credentials are sufficient for rejoin and bypass password entry.
- Password values are never returned to the app after creation.

## Private Data Compatibility

All players and spectators in a match must use the exact same private data fingerprint.

### Fingerprint Rules

- The app computes a deterministic fingerprint from the normalized private data bundle used for the match.
- Placeholder/default data gets a stable placeholder fingerprint.
- Private data bundles are canonicalized before hashing so equivalent object key order produces the same fingerprint.
- The server stores the fingerprint in private lobby metadata.
- Public list responses expose only a safe label, such as `private_data_required`.

### Join And Spectate Rules

- Host sends the fingerprint at match creation.
- Join requests send the local fingerprint.
- Spectate requests send the local fingerprint.
- Rejoin checks the current local fingerprint before reconnecting.
- Mismatched fingerprints are rejected before credentials or state are issued.
- The UI should guide the user to import/select matching private data before retrying.

Exact matching is intentionally strict for the first version.

## Online Games Hub UI

The Online Games hub is a dedicated screen or major app view, separate from the setup form.

### Top-Level Sections

1. **Resume Games**
   - Shows saved online sessions from local storage.
   - Displays room name, seat, last updated time, connection status if known, and private-data compatibility.
   - Provides `Rejoin` and `Forget` actions.

2. **Host Game**
   - Room name.
   - Player count.
   - Setup summary.
   - Optional password.
   - Private-data status/fingerprint label.
   - `Host Game` action.

3. **Join By Code**
   - Room code or match ID.
   - Optional password.
   - Player display name.
   - Seat choice after match lookup.

4. **Browse Games**
   - Listed matches sorted by usefulness.
   - Filters for open seats, locked games, in-progress spectatable games, and ended/full games.
   - Refresh state and server error state.

### Match Row Behavior

Rows should show:

- room name,
- lock indicator,
- status,
- player count and occupied seats,
- setup summary,
- private-data requirement,
- last updated time,
- available actions.

Actions:

- `Join Seat` for setup-phase games with open seats and compatible private data.
- `Enter Password` for locked games before join or spectate.
- `Spectate` for eligible games.
- `Rejoin` when local credentials match.
- Disabled explanatory states for full games, ended games, private-data mismatch, stale credentials, and server errors.

## Data Flows

### Host

1. User opens Online Games.
2. User configures room name, setup, player count, optional password, and private data.
3. App computes private-data fingerprint and setup summary.
4. Server validates setup and creates a boardgame.io match.
5. Server creates Polity lobby metadata.
6. Host receives player credentials for seat `0`.
7. App stores reconnect data locally and enters player mode.

### Join

1. App lists public match metadata.
2. User selects a game and open seat.
3. If locked, UI asks for password.
4. App sends player name, seat, password if needed, and private-data fingerprint.
5. Server validates password, fingerprint, seat availability, and match status.
6. Server issues boardgame.io credentials.
7. App stores reconnect data locally and enters player mode.

### Spectate

1. User selects `Spectate`.
2. If locked, UI asks for password.
3. App sends password if needed and private-data fingerprint.
4. Server validates access.
5. App enters read-only spectator mode.
6. Spectator state uses public `playerView` redaction and must not expose hidden data.

### Reconnect

1. App loads saved online sessions from local storage.
2. App checks whether each match exists and whether local private data still matches.
3. Valid sessions appear as rejoin cards.
4. Rejoin uses saved credentials.
5. Stale credentials, missing matches, or private-data mismatches show clear recovery actions.

## Spectator Mode

Spectation is first-class but read-only.

- Spectators can enter games that allow spectation and pass password/private-data gates.
- Spectators cannot submit moves, resolve pending choices, or mutate match state.
- Spectators receive public-only redacted state.
- Spectators can see public zones, current turn information, public logs, scores, and setup summary.
- Spectators cannot see hidden hands, hidden deck order, private pending choices, rollback snapshots, private imports, or any other player-only state.

The first implementation should use spectator credentials issued by the Polity lobby layer so spectator access follows the same password and private-data gates as player access. The privacy boundary must be enforced server-side.

## Error States

The UI and API must handle:

- server unavailable,
- match no longer exists,
- match full,
- match already in progress for player join,
- wrong password,
- missing password,
- private-data mismatch,
- stale saved credentials,
- unsupported game version,
- spectation disabled or unavailable,
- invalid setup payload.

Errors should be specific enough for recovery without leaking private metadata.

## Testing

### Server Tests

- Creates lobby metadata when creating a match.
- Lists open and locked games without leaking passwords or verifiers.
- Rejects wrong password.
- Allows correct password.
- Rejects private-data fingerprint mismatch.
- Allows saved credential rejoin.
- Authorizes spectator access.
- Rejects spectator access for wrong password or fingerprint mismatch.

### App Tests

- Renders Online Games hub sections.
- Computes stable private-data fingerprints.
- Sorts match rows by joinability.
- Shows locked/open states.
- Handles wrong password and private-data mismatch states.
- Stores and reads rejoin records.
- Routes into player mode and spectator mode.

### Engine Tests

- Player views hide other players' private zones.
- Spectator/public view hides all player-private zones.
- Hidden card IDs do not appear in serialized redacted state.
- Wrong-player move authorization remains enforced.

### Manual Smoke Tests

- Host open game.
- Host locked game.
- Join locked game with wrong password, then correct password.
- Reject mismatched private data.
- Rejoin saved seat.
- Spectate in-progress game.
- Confirm no server URL appears in normal UI.
- Confirm spectators cannot submit moves.

## Rollout Plan

1. Add Polity lobby metadata model and list endpoints.
2. Add private-data fingerprinting.
3. Add Online Games hub UI skeleton.
4. Add host and public match listing.
5. Add password-locked join flow.
6. Add saved rejoin cards.
7. Add spectator authorization and read-only app mode.
8. Remove or simplify setup-embedded online controls, replacing them with entry points to Online Games.
9. Add deployment documentation for same-origin hosting, WebSockets, persistence, and CORS.

## Acceptance Criteria

- Users can browse listed online games without entering a server URL.
- Open games are visible and joinable when seats are available.
- Locked games are visible but require a password to join or spectate.
- Rejoin works from saved credentials.
- Private-data mismatches are blocked before credentials or state are issued.
- Spectators can view public state but cannot see private information or submit moves.
- Local/offline play remains intact.
- Typecheck and relevant app, server, and engine tests pass.
