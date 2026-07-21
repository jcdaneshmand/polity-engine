# Save/Resume UX Design

Purpose: define the app-side save/resume experience before engine persistence is implemented.

This design intentionally avoids official card text, artwork, names, and rulebook wording. Saved game metadata should use mode/options, counts, timestamps, and data-source labels, not card identities from hidden zones or private text.

## Goals

- Let a player leave an in-progress local game and return later.
- Make save slots understandable without revealing hidden information.
- Keep the first implementation local-only and deterministic.
- Avoid changing engine rules behavior while rules parity work is active.

## First Pass UX

Current implementation autosaves local games after board updates and refreshes the saved-game panel when returning to setup. Manual naming is supported at the storage layer through `metadata.slotName`; the UI currently uses the `Autosave` slot.

Future manual save controls can add a `Save Game` action to the game shell bar beside `New Game`.

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
- `Export` and `Import` actions for local JSON save files

## Storage Shape

The app owns save metadata. The engine owns serializable game state.

```ts
type SavedLocalGameEnvelope = {
  version: 1;
  savedAtIso: string;
  privateDataFingerprint: string;
  metadata: {
    slotName: string;
    mode: string;
    playerCount?: number;
    round?: number;
    currentPlayer?: string;
    enabledExpansions: string[];
    enabledVariants: string[];
    commonsSetId?: string;
    dataSource: "placeholder" | "private";
  };
  state: unknown;
};
```

The current first pass uses `localStorage` under `polity-engine.localGame.v1` for the active local slot. `upsertLocalGameSlot` supports named slot replacement and most-recent-first ordering for the next UI expansion. If a later engine snapshot format needs migration, add a versioned migration layer before loading any slot.

## Hidden Information

Save metadata must not include face-down card identities, hidden deck order, hidden Bot deck cards, private raw text, generated private names, or non-current-player hand contents. The full serialized engine snapshot may contain hidden card IDs for restore, but the resume list must only render public-safe metadata. Import rejects corrupt JSON, unsupported versions, private-field contamination, non-resumable state, and explicit private-data fingerprint mismatches when an expected fingerprint is supplied.

## Verification

- Unit test the save-slot metadata formatter with placeholder and private-data sessions.
- Unit test that resume list rows omit hidden card IDs and card names from metadata.
- Browser-test autosave creation, returning to setup, resuming, export/import controls visibility, and corrupt-save rejection.
- Typecheck both app and engine after adding the serialization boundary.

## Deferred

- Cloud sync.
- Import/export save files.
- Cross-version migration UI.
- Mid-dialog save naming from controller/gamepad input.
