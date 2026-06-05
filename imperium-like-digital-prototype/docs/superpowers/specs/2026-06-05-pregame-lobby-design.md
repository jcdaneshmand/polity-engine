# Pregame Lobby Design

Date: 2026-06-05

## Purpose

Polity Engine needs a real pregame lobby layer between the match browser and the boardgame.io match. The current online browser creates a boardgame.io match as soon as the host clicks `Host Game`, which makes setup changes, player readiness, nation selection, abandoned-room cleanup, and original-player rejoin semantics harder than they should be.

The next online iteration should list lobby rooms first. A lobby room gathers players, reserves seats, lets the host adjust setup, lets players choose nations, and starts the real game only after all required players are ready.

## Product Decisions

- The browser lists pregame lobbies and started games.
- Hosting creates a pregame lobby, not a boardgame.io match.
- The host may change setup until all required players are ready.
- Any host setup change clears ready states and unlocks the setup.
- Players choose their own nation before marking ready.
- Any player nation change clears that player's ready state.
- When every required seat is occupied and ready, setup becomes locked.
- The host starts the game after the lobby is locked.
- Starting creates the boardgame.io match and issues player credentials for the original lobby seats.
- Rejoinable games are only rejoinable by the original players with saved credentials.
- Empty unstarted lobbies remain reserved for a 10 minute grace period, then disappear from the browser and are deleted.
- Pregame spectators are not supported in this version; spectation starts only after the game starts.

## Non-Goals

- Accounts, profiles, friend lists, invitations, or social identity.
- Replacement players after a game starts.
- Host transfer if the host leaves.
- Chat.
- Pregame spectators.
- Ranked matchmaking.
- Fuzzy private-data compatibility.

## Terms

- **Lobby room:** A pregame room visible in the browser before a boardgame.io match exists.
- **Lobby participant:** A connected or recently disconnected browser/client with lobby credentials.
- **Seat:** A player slot in the lobby and, after start, the same player slot in the boardgame.io match.
- **Started game:** A boardgame.io match created from a finalized lobby.
- **Original player:** The participant that occupied a seat when the host started the game.

## Architecture

The server should introduce a Polity lobby-room model separate from boardgame.io match metadata.

### Server Responsibilities

- Create lobby rooms.
- Store lobby setup, seats, readiness, host identity, password lock state, and private-data fingerprint.
- Authorize lobby join/rejoin with lobby credentials.
- Let the host update setup while the lobby is not fully ready.
- Let players claim seats and choose nations.
- Clear ready states when setup or nation choices change.
- Delete abandoned unstarted lobbies after the grace period.
- Create the boardgame.io match only when the host starts a fully ready lobby.
- Join original lobby players into their exact boardgame.io seats and store their player credentials.
- List only public-safe lobby/game metadata.

### App Responsibilities

- Show pregame lobby rooms in Online Games.
- Provide a lobby room view.
- Let host edit setup while unlocked.
- Let players choose nations and mark ready.
- Store lobby credentials before start and game credentials after start.
- Rejoin a pregame lobby or started game only when local saved credentials match.
- Enter player mode after start.
- Offer spectation only for started games.

### Engine Responsibilities

- Continue to own game setup validation, move validation, and playerView redaction.
- Receive finalized setup only when a real game starts.

## Lobby Data Model

Private server metadata:

```ts
type LobbyRoom = {
  lobbyID: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  emptySince?: string;
  status: "waiting" | "locked" | "starting" | "started" | "abandoned";
  hostClientID: string;
  isLocked: boolean;
  passwordVerifier?: string;
  privateDataFingerprint: string;
  setup: LobbySetup;
  seats: LobbySeat[];
  startedMatchID?: string;
  spectatingAllowed: boolean;
};
```

```ts
type LobbySeat = {
  seatID: string;
  clientID?: string;
  displayName?: string;
  lobbyCredentials?: string;
  connected: boolean;
  ready: boolean;
  selectedNationID?: string;
  playerCredentials?: string;
};
```

Public browser metadata:

```ts
type ListedLobby = {
  kind: "lobby";
  lobbyID: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  status: "waiting" | "locked";
  playerCount: number;
  occupiedSeats: Array<{
    seatID: string;
    displayName: string;
    connected: boolean;
    ready: boolean;
    selectedNationLabel?: string;
  }>;
  availableSeats: string[];
  isLocked: boolean;
  privateDataLabel: "placeholder" | "private_data_required";
  setupSummary: {
    commonsSetId: string;
    enabledExpansions: string[];
    enabledVariants: string[];
    nationLabels: string[];
  };
};
```

Public list responses must not expose room passwords, password verifiers, lobby credentials, player credentials, exact private-data fingerprints, private setup payloads, hidden state, or local file paths.

## Lobby Lifecycle

### Create Lobby

1. Host opens Online Games.
2. Host chooses room name, player count, setup options, optional password, and private data.
3. App computes the private-data fingerprint.
4. Server creates a lobby room with seat `0` occupied by the host.
5. Server returns host lobby credentials.
6. App stores the host's lobby credentials locally and opens the lobby room view.

No boardgame.io match is created during this flow.

### Join Lobby

1. Player selects a listed lobby or enters a lobby code.
2. If locked, player enters the password.
3. App sends display name, password if needed, and private-data fingerprint.
4. Server validates password, fingerprint, lobby status, and seat availability.
5. Server assigns the first available seat or a requested available seat.
6. Server returns lobby credentials for that seat.
7. App stores the lobby credentials locally and opens the lobby room view.

### Rejoin Lobby

1. App loads saved lobby credentials.
2. Server validates the lobby ID, seat ID, and lobby credentials.
3. If valid and the lobby is unstarted, the participant returns to the same seat.
4. Rejoining does not require the room password.

### Host Setup Changes

The host can edit setup while the lobby status is `waiting`.

Host-editable setup includes:

- room name,
- player count,
- commons set,
- enabled expansions,
- enabled variants,
- private-data mode/fingerprint,
- password lock state,
- post-start spectation setting.

Any host setup change:

- sets all occupied seats to `ready: false`,
- clears the locked state,
- updates the setup summary,
- may require players to re-check private-data compatibility.

If player count increases, new empty seats are added. If player count decreases, the server may remove empty highest-numbered seats. If occupied seats would be removed, the change is rejected unless the host first removes those participants.

### Nation Selection

Each occupied player seat chooses one nation. Changing a nation sets that seat to `ready: false`.

The host can choose their own nation and may choose nations for empty seats only if the final game supports an empty-seat or bot flow. For this multiplayer lobby version, all required player seats must be occupied before start.

Nation choices are validated against the current setup. If setup changes make a selected nation invalid, the server clears that seat's selected nation and ready state.

### Ready And Lock

A seat can mark ready only when:

- it is occupied,
- the local private-data fingerprint matches the lobby fingerprint,
- it has a valid selected nation,
- its lobby credentials are valid.

When every required seat is occupied and ready, the lobby status becomes `locked`. A locked lobby cannot accept setup changes unless the host explicitly unlocks it, which returns the lobby to `waiting` and clears ready states.

### Start Game

Only the host can start a game, and only when the lobby is locked.

Start flow:

1. Server marks the lobby `starting`.
2. Server builds finalized setup data from the lobby setup and `seatID -> selectedNationID`.
3. Server creates the boardgame.io match.
4. Server joins each occupied seat to the same boardgame.io player ID.
5. Server stores each seat's player credentials.
6. Server marks the lobby `started` and stores `startedMatchID`.
7. Connected clients receive or poll the started-game credentials and enter player mode.

If any step fails, the lobby returns to `waiting`, clears ready states, and surfaces a recoverable error to the host.

## Rejoin Semantics

Rejoin is credential-bound and seat-bound.

- Before start, lobby credentials rejoin the same lobby seat.
- After start, saved game credentials rejoin the same boardgame.io seat.
- Public browsers can show that a started game exists, but they do not offer `Rejoin` unless local storage has matching credentials.
- Another player cannot take a started game's original seat.
- Replacement players after start are intentionally out of scope.

If a player disconnects before start, their seat remains reserved during the 10 minute empty-lobby grace period. The host can manually remove disconnected players before start to free seats.

## Cleanup Rules

Unstarted lobbies should not pile up forever.

- Track connected participants per lobby.
- When the last participant disconnects from an unstarted lobby, set `emptySince`.
- If any participant reconnects before cleanup, clear `emptySince`.
- Hide and delete unstarted lobbies that remain empty for 10 minutes.
- Do not delete started games just because no one is connected.
- Do not delete lobbies in `starting`; either finish start or recover to `waiting`.

Cleanup can run opportunistically on list requests and on a periodic server timer. The same cleanup function should be unit-tested with a fake clock.

## Spectation

Spectation is available only after a game starts.

- Pregame lobbies do not support spectators.
- Started games may allow spectators if the lobby's `spectatingAllowed` setting is true.
- Spectators must pass password and private-data gates for the started game.
- Spectators never receive player credentials and cannot submit moves.
- Server-side `playerView` remains the privacy boundary.

## Error States

The UI and API must handle:

- lobby no longer exists,
- lobby full,
- lobby already started,
- wrong password,
- missing password,
- private-data mismatch,
- invalid or stale lobby credentials,
- invalid host action,
- setup change rejected because occupied seats would be removed,
- invalid nation selection,
- not all players ready,
- game start failure,
- server unavailable.

Errors should be specific enough for recovery without leaking private data or credentials.

## Testing

### Server Tests

- Creating a lobby does not create a boardgame.io match.
- Host receives lobby credentials and occupies seat `0`.
- Public lobby listing omits passwords, verifiers, credentials, exact fingerprints, and private setup data.
- Joining locked lobbies requires the password.
- Joining validates private-data fingerprint before issuing lobby credentials.
- Rejoining a lobby requires valid lobby credentials.
- Host setup changes clear ready states.
- Player nation changes clear that player's ready state.
- Invalid setup changes are rejected when they would remove occupied seats.
- Lobby locks only when all required seats are occupied and ready.
- Starting creates the boardgame.io match and joins original seats.
- Started games are rejoinable only with saved original credentials.
- Empty unstarted lobbies are deleted after 10 minutes.
- Started games are not deleted by empty-lobby cleanup.

### App Tests

- Online Games lists lobby rooms and started games distinctly.
- Host flow opens a lobby room instead of immediately entering game mode.
- Lobby room renders host setup controls for the host only.
- Players can choose nations and mark ready.
- Setup changes clear ready state in the rendered lobby.
- Locked lobby state disables setup controls until the host unlocks.
- Start Game appears only for the host when all seats are ready.
- Rejoin cards distinguish pregame lobby rejoin from started-game rejoin.
- Spectate action appears only for started games.

### Manual Smoke Tests

- Host a public lobby and confirm no boardgame.io match exists until start.
- Join from another browser, choose nation, and ready.
- Change setup as host and confirm ready states clear.
- Fill all seats, ready all players, and start.
- Confirm each browser enters the correct original seat.
- Refresh one browser before start and rejoin the same lobby seat.
- Refresh one browser after start and rejoin the same game seat.
- Disconnect all players from an unstarted lobby, wait through cleanup, and confirm it disappears.
- Confirm spectators cannot enter before start but can spectate after start when allowed.

## Rollout Plan

1. Add lobby-room store and types beside the existing match metadata.
2. Add lobby create/list/join/rejoin/update/ready/start endpoints.
3. Add cleanup logic with fake-clock tests.
4. Update Online Games to show lobby rooms separately from started games.
5. Add lobby room UI for host setup, seat list, nation choices, and readiness.
6. Change host flow to create a lobby instead of immediately creating a boardgame.io match.
7. Move boardgame.io match creation into the host Start Game flow.
8. Update saved session storage to support pregame lobby credentials and started game credentials.
9. Keep existing started-game spectation, but hide spectation for unstarted lobbies.

## Acceptance Criteria

- Empty unstarted lobbies disappear after 10 minutes with no connected participants.
- Host can change setup until all required players are ready.
- Setup changes clear ready states.
- Players choose nations before readying.
- Games are created only when the host starts a locked lobby.
- Started games are rejoinable only by original saved credentials.
- Spectation is unavailable before start and available after start according to game settings.
- Public listings remain safe and do not expose secrets, credentials, exact fingerprints, private setup data, or hidden state.
- Typecheck, server tests, app tests, engine privacy tests, build, and live smoke checks pass.
