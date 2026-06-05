# Local Accounts, Admin, And Game History Design

## Context

The online lobby now supports hosted rooms, pregame lobbies, chat, saved resume state in the browser, host-owned match closing, explicit lobby leaving, stale-seat cleanup, and an admin-like "Clear All Games" action. The clear-all action is currently only a UI/API affordance; it needs real account-backed authorization before it should be trusted.

This design adds local server accounts without requiring an external identity provider or database. Guests remain welcome for casual play, while signed-in accounts unlock chat, server-side game history, stats, saved resume history, and admin actions.

## Goals

- Allow anyone to create a local account with email, username, and password.
- Allow guests to browse, host, join, and play games.
- Restrict chat, saved game history, persistent resume history, and stats to signed-in accounts.
- Make admin actions real server-side permissions, not just hidden UI.
- Track online game history and stats for accounts.
- Track solo history and stats for accounts, including standard solo, campaign, and practice where applicable.
- Keep a durable record of played games with nations used and all result stats available from the game state.
- Provide stats stratified by nation as well as by play scope and variant.
- Keep the first implementation local, testable, and compatible with `dev:full`.

## Non-Goals

- No external OAuth or hosted authentication.
- No email verification, password reset email, or outbound mail.
- No cross-device sync beyond connecting to the same local server storage.
- No moderation tools beyond admin-only clear-all for this phase.
- No attempt to make guest play persistent.

## Account Model

Accounts are stored server-side in a local JSON store.

Each account has:

- `id`: server-generated stable ID.
- `email`: required, unique case-insensitively.
- `username`: required, unique case-insensitively, shown in chat and game history.
- `passwordHash`: salted hash stored server-side.
- `role`: `player` or `admin`.
- `createdAt` and `updatedAt`.
- `stats`: online and solo stat buckets.
- `nationStats`: per-nation stat buckets.
- `history`: saved game history entries or references.

The first account becomes admin through this bootstrap rule:

- If no accounts exist, the first created account becomes `admin`.
- Once any account exists, open registration creates `player` accounts.

This keeps setup simple and avoids shipping an always-valid admin password.

## Sessions

Signing in returns an opaque session token. The app stores that token locally and sends it to account-aware APIs.

Sessions have:

- `tokenHash`: server-side hash of the opaque token.
- `accountID`.
- `createdAt`.
- `lastSeenAt`.
- `expiresAt`: omitted in the first implementation. Sessions persist until sign-out or server-side deletion.

The app can call a `GET /polity/accounts/me` style endpoint to restore the signed-in account on reload.

## Guest Behavior

Guests can:

- Open Online Games.
- Browse listed lobbies and matches.
- Host a game.
- Join a lobby or match.
- Spectate where the game allows it.
- Play solo locally.

Guests cannot:

- Send online lounge chat.
- Send pregame lobby chat.
- Save server-side resume history.
- Save solo or online game history.
- Accrue stats.
- Use admin actions.

Guest restrictions must be enforced both in the app and server. The UI should explain the disabled action briefly, but the server remains the source of truth.

## Admin Behavior

Admin-only endpoints require a valid signed-in account session with `role: "admin"`.

The current `POST /polity/lobby/admin/clear` endpoint becomes admin-protected. The Online Games screen shows `Clear All Games` only for admin accounts.

If a non-admin or guest manually calls an admin endpoint, the server returns `403`.

## Game History

Signed-in accounts get server-side history entries. Guests do not.

Shared history fields:

- `id`: server-generated entry ID.
- `accountID`.
- `scope`: `solo` or `online`.
- `variant`: `standard`, `campaign`, `practice`, or `multiplayer`.
- `status`: `started`, `completed`, or `abandoned`.
- `outcome`: `win`, `loss`, `unfinished`, or `unknown`.
- `sessionID` or `matchID`.
- `roomName`, if online.
- `playerID`, if applicable.
- `playerCount`.
- `nationID`, if known.
- `nationName`, if known.
- `opponentNationIDs`, if known.
- `opponentNationNames`, if known.
- `winnerID`, if known.
- `winnerNationID`, if known.
- `reason`, if known.
- `scores`, if supplied by `G.gameover`.
- `tieBreakScores`, if supplied by `G.gameover`.
- `roundsPlayed`, if known.
- `finalResources`, if available.
- `finalDeckSize`, if available.
- `finalCardsInPlay`, if available.
- `finalUnrest`, if available.
- `finalFame`, if available.
- `rawSummaryStats`: a JSON object for any additional stable end-game summary fields the app can derive.
- `startedAt`, `updatedAt`, and optional `endedAt`.

Online resume history is account-backed. When a signed-in user joins or hosts an online lobby/match, the server records enough information to show a resume entry after browser reload. Browser local storage can still cache the latest token/session, but account history is authoritative.

History is not only a resume list. It is the permanent record of played games. Completed game entries should keep all durable stats the app can reasonably extract at game end, including nations used, scores, gameover reason, and variant-specific details. This lets the account page later show rich history without rerunning old game states.

## Stats

Stats are derived from recorded history updates and stored on the account for fast display.

Shape:

```ts
type AccountStats = {
  solo: {
    standard: {
      gamesPlayed: number;
      wins: number;
      losses: number;
      unfinished: number;
      lastPlayedAt?: string;
    };
    campaign: {
      campaignsStarted: number;
      campaignsCompleted: number;
      gamesPlayed: number;
      wins: number;
      losses: number;
      unfinished: number;
      bestRecord?: string;
      lastPlayedAt?: string;
    };
    practice: {
      gamesPlayed: number;
      wins: number;
      losses: number;
      unfinished: number;
      bestScore?: number;
      lastPlayedAt?: string;
    };
  };
  online: {
    gamesPlayed: number;
    wins: number;
    losses: number;
    unfinished: number;
    lastPlayedAt?: string;
  };
  byNation: Record<string, {
    gamesPlayed: number;
    wins: number;
    losses: number;
    unfinished: number;
    soloGamesPlayed: number;
    onlineGamesPlayed: number;
    campaignGamesPlayed: number;
    practiceGamesPlayed: number;
    lastPlayedAt?: string;
  }>;
};
```

The first implementation stores these counters directly. Richer computed views can be added in a separate phase.

Nation stats update for the account player's nation. If the same account later plays as the same nation across solo, campaign, practice, or online games, those results accumulate in the same nation bucket while still preserving the top-level solo/online splits.

## Result Recording

The engine already exposes completed game data through `G.gameover`, including winner, reason, and scores. The app should report results to the account API when an end-game summary is shown.

Solo standard and practice:

- The signed-in app creates or updates a solo history entry when the game starts.
- On `G.gameover`, it reports the completed result once.
- The server makes result recording idempotent by history entry ID.

Solo campaign:

- Individual campaign games increment campaign game stats.
- Campaign progress already tracks wins, losses, and completion. Account stats separately track campaign-level starts and completions from the campaign progress object the app already receives.
- The first implementation records each campaign game result and marks campaign completion when the app reports a completed campaign progress object.

Online:

- Signed-in players get account-backed resume entries when they host/join.
- On `G.gameover`, the app reports that player's result.
- The server stores result updates idempotently so refreshes do not double-count.
- If multiple signed-in players report the same match, each account receives its own history/stats update.

## Server Components

Add an account store module with focused responsibilities:

- Create account.
- Validate sign-in.
- Create/delete sessions.
- Resolve session tokens.
- Check admin permission.
- Record history entries and idempotent results.
- Maintain stats.

Add account middleware/helper functions used by lobby routes:

- Optional auth for guest-compatible endpoints.
- Required auth for chat.
- Required admin auth for clear-all.

Persist the account store as JSON. If `POLITY_STORAGE_PATH` is set, store account data under that directory. Otherwise use a local development data path in the server package or a clearly named repo-local data directory ignored by git.

## App Components

Add account API helpers in `onlineSession.ts` or a new account-specific client module.

Online Games screen changes:

- Account panel with create account, sign in, sign out, current username, and admin badge.
- Chat input disabled for guests.
- Server-side saved resume/history section for signed-in accounts.
- Admin clear button only for admin accounts.

Lobby screen changes:

- Lobby chat disabled for guests.
- Signed-in account identity is used for chat author where available.

Solo game changes:

- When a signed-in user starts a solo game, create a solo history entry.
- When the end-game summary appears, report the result to account history.
- Campaign and practice variants set the correct solo stats bucket.

## Error Handling

- Duplicate email or username returns `409`.
- Invalid sign-in returns `401`.
- Missing session on protected non-admin actions returns `401`.
- Non-admin session on admin endpoints returns `403`.
- Malformed account requests return `400`.
- Account API failures should not crash gameplay; the app should show account/status messages and let the user continue locally where possible.

## Testing

Server tests:

- Open account registration creates player accounts after the first admin.
- First account becomes admin.
- Duplicate email/username is rejected.
- Sign-in creates a usable session.
- Invalid sign-in is rejected.
- Chat rejects guests and accepts signed-in accounts.
- Admin clear rejects guests and players, accepts admin.
- History result recording is idempotent.
- Online and solo stats update the correct buckets.
- Campaign and practice stats update separately from standard solo.
- Played-game history stores nation IDs, scores, gameover reason, and available final summary stats.
- Per-nation stats update independently from aggregate stats.

App tests:

- Online account panel renders guest, signed-in player, and admin states.
- Guests see disabled chat and no persistent resume/history.
- Signed-in users can send chat through account-aware helpers.
- Admin users see `Clear All Games`; players and guests do not.
- Solo result reporting chooses standard, campaign, or practice variant.

## Rollout Plan

1. Add account store types, persistence, and server tests.
2. Add account HTTP endpoints and session validation.
3. Protect chat and admin clear on the server.
4. Add app account client helpers and account state.
5. Add Online Games account panel and guest restrictions.
6. Move saved resume/history for signed-in online games to the account API.
7. Add solo game history/result reporting.
8. Add campaign and practice stat buckets.
9. Run focused app/server tests, typecheck, and `dev-full` script tests.

## Self-Review

- No external auth is assumed.
- Guest permissions are explicit and enforced server-side where relevant.
- Admin power is tied to server-side role checks.
- Solo stats include standard, campaign, and practice buckets.
- Online stats remain separate from solo stats.
- Played game records include nations and durable end-game stats.
- Stats are stratified by nation as well as by play scope and variant.
- Result recording is designed to be idempotent to avoid double-counting on refresh.
