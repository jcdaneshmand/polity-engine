# Rules Engine Plan

## Data-driven card definitions
Cards live in JSON with stable IDs, type, tags, cost, and effect arrays. Zones store card IDs, while runtime card metadata comes from `cardDb`.

## Effect runner concept
A small effect runner resolves card effects in sequence. The first pass supports deterministic core operations (`draw`, resource changes, zone moves, acquisition, and simple conditionals).

## Future asymmetric civilization support
Civilizations can be modeled as start-deck presets, passive modifiers, and card pools keyed by civilization ID. Engine state remains generic while data defines asymmetry.

## Nation and development progression
Reshuffle progression is not a generic "add any progression card" hook:

- While a player has cards in their Nation deck, reshuffle adds the top Nation card to discard deterministically before the discard pile becomes the new draw deck.
- Once the Nation deck is empty, reshuffle may offer a payable Development choice from the face-up Development area. The selected card goes to discard before the discard pile becomes the new draw deck.
- This means Development requires an interruptible choice/payment flow, while Nation progression only needs deterministic order and state/accession hooks.

## Future bot/solo support
Bot behavior can consume exposed move/state APIs to evaluate legal actions and prioritize resource curves, market priorities, and round pacing.

## Future save/resume support
Persist full `GameState` snapshots (including log and round) to local storage or server-backed storage and rehydrate through setup/load helpers.

## Canonical turn lifecycle contract
The engine follows a fixed turn sequencing contract to avoid undefined transitions:
1. **Action execution** (`playCard`) resolves action token spend and card effects.
2. **Acquire resolution** (`acquireCard`) resolves market acquisition and explicit market status logging.
3. **Cleanup** (`onTurnEnd`) moves hand + play area to discard and runs cleanup overrides.
4. **Reshuffle as needed** (draw lifecycle via `drawCardWithReshuffleLifecycle`) resolves deterministic Nation progression or pending Development choice before shuffling through the injected RNG path.
5. **Turn handoff** (end-turn completion) advances round/log lifecycle for the next player.

This contract is also reflected in `TurnPhase(...)` log entries and market setup notes for deterministic audits.
