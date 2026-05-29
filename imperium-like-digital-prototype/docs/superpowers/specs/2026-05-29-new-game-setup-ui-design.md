# New Game Setup UI Design

## Context

The prototype currently mounts a fixed `boardgame.io` React client from `imperium-like-digital-prototype/app/src/App.tsx` with `numPlayers: 2` and no interactive setup step. The engine already accepts setup data through `PrototypeGame.setup`, including `GameOptions`, optional player nation IDs, and private-data paths. The existing option model supports multiplayer, solo, practice, expansion toggles, variants, and solo difficulty.

This design adds an in-app new-game flow for the existing prototype game. It does not add a second rules engine, persistence, routing, or save/load slots.

## Goals

- Let a user configure and launch a fresh game from the app UI.
- Use the existing engine setup API and validation model.
- Make starting a new session reset the `boardgame.io` client cleanly.
- Keep the UI operational and compact, matching the current board-tool feel.
- Avoid changing engine rules unless a small type or export adjustment is required.

## Non-Goals

- Save/load support.
- Multiple distinct game products or rules engines.
- Private content management UI.
- Full routing or deep links.
- A marketing-style landing page.

## Architecture

`App.tsx` becomes a small session shell:

- When no active session exists, render a setup screen.
- When a session exists, render a keyed `boardgame.io` client.
- The client key changes for each started game, forcing a fresh in-memory session.
- The client receives `numPlayers` from the selected options and receives `setupData` with `{ options, playerNationIds }`.

The setup screen will live in the app layer under `imperium-like-digital-prototype/app/src/ui/setup/`. It should not reach into engine internals beyond importing option types/defaults and stable option constants.

## Setup UI

The setup screen provides controls for:

- Mode: `multiplayer`, `solo`, or `practice`.
- Player count: 2-4 for multiplayer, fixed to 1 for solo and practice.
- Expansions: `trade_routes`.
- Variants: `lowered_aggression`, `quick_setup`, `precious_cards`, `short_game`.
- Solo difficulty: visible/enabled only in solo mode, defaulting to `chieftain`.
- Player nation IDs: one select control per active player, defaulting to `test_nation_sun_coast`.

The first implementation uses a small app-local placeholder nation list:

- `test_nation_sun_coast` / Sun Coast Accord, always available.
- `test_nation_river_court` / River Court Forum, available only when `trade_routes` is enabled.

This avoids building a full nation browser while still reflecting the placeholder nations currently loaded by the engine.

The UI should be dense and utilitarian:

- Use segmented-style buttons or select controls for mode and player count.
- Use checkboxes/toggles for expansions and variants.
- Avoid hero copy, oversized cards, or decorative layout.
- Keep text concise and ensure controls fit on narrow screens.

## Game UI

The running game view gets a compact top-level control to start a new game. Activating it returns the user to the setup screen and drops the current in-memory session. This action does not mutate engine state and does not attempt to preserve the active game.

## Data Flow

The setup form owns draft values. On start:

1. Normalize mode-dependent values:
   - Multiplayer uses player counts 2-4 and omits solo difficulty.
   - Solo uses player count 1 and includes solo difficulty.
   - Practice uses player count 1 and omits solo difficulty.
2. Build a `GameOptions` object.
3. Build `playerNationIds` for the active players.
4. Create a session object with a unique key, `numPlayers`, and `setupData`.
5. Render the keyed game client.

The engine remains responsible for final validation through `validateGameOptions` during setup. UI controls should prevent obvious invalid combinations, but they do not replace engine validation.

## Error Handling

The setup form prevents invalid option combinations through controlled inputs before the game client is mounted. When `trade_routes` is disabled, any selected River Court Forum player is reset to Sun Coast Accord before launch. Since the form uses a fixed placeholder nation list, invalid free-text nation IDs are not accepted.

## Testing And Verification

Verification should include:

- Typecheck for engine and app.
- Existing engine tests.
- A browser smoke check that the app opens to the setup screen, starts a game, and returns to setup through the new-game action.

If the app already has an appropriate test harness, add focused tests for:

- Mode changes normalize player count and solo difficulty.
- Starting a game passes expected `GameOptions` and player nation IDs.
- Starting a second game changes the session key.

If no app test harness exists, do not add a large testing stack just for this feature; rely on typecheck and browser smoke verification.

## Implementation Decisions

- Component path: `imperium-like-digital-prototype/app/src/ui/setup/NewGameSetup.tsx`.
- Styling path: `imperium-like-digital-prototype/app/src/ui/styles/setup.css`, imported by `app/src/styles.css`.
- Nation controls: select controls backed by the two known placeholder nation IDs listed above.
