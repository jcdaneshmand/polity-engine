# Save/Resume UX Design

Purpose: define the app-side save/resume experience before engine persistence is implemented.

This design intentionally avoids official card text, artwork, names, and rulebook wording. Saved game metadata should use prototype IDs, placeholder display names, counts, and user-provided private data already loaded locally.

## Goals

- Let a player leave an in-progress local game and return later.
- Make save slots understandable without revealing hidden information.
- Keep the first implementation local-only and deterministic.
- Avoid changing engine rules behavior while rules parity work is active.

## First Pass UX

Add a `Save Game` control to the game shell bar beside `New Game`.

When selected, open a compact save dialog with:

- slot name, defaulting to mode plus date/time
- current mode and player count
- current round and active player
- enabled expansions and variants
- private data status: placeholder data or private data loaded
- overwrite confirmation when replacing an existing local slot

The setup screen gains a `Resume Game` area above the configuration grid when local saves exist. Each save row shows:

- slot name
- mode/player count
- round and active player
- last saved timestamp
- data status
- `Resume` and `Delete` actions

## Storage Shape

The app owns save metadata. The engine owns serializable game state.

```ts
type SavedGameSlot = {
  id: string;
  name: string;
  savedAt: string;
  appVersion: string;
  metadata: {
    mode: string;
    playerCount: number;
    round: number;
    currentPlayer: string;
    enabledExpansions: string[];
    enabledVariants: string[];
    commonsSetId: string;
    usesPrivateData: boolean;
  };
  sessionConfig: NewGameSessionConfig;
  gameState: unknown;
};
```

The first pass can use `localStorage` under one key, `polity-engine.savedGames.v1`. If a later engine snapshot format needs migration, add a versioned migration layer before loading any slot.

## Hidden Information

Save metadata must not include face-down card identities, hidden deck order, hidden Bot deck cards, or non-current-player hand contents. The full serialized engine snapshot may contain that data for restore, but the resume list must only render public-safe metadata.

## Verification

- Unit test the save-slot metadata formatter with placeholder and private-data sessions.
- Unit test that resume list rows omit hidden card IDs and card names from metadata.
- Browser-test saving, returning to setup, resuming, and deleting a slot.
- Typecheck both app and engine after adding the serialization boundary.

## Deferred

- Cloud sync.
- Import/export save files.
- Cross-version migration UI.
- Mid-dialog save naming from controller/gamepad input.
