# Rules Engine Plan

## Data-driven card definitions
Cards live in JSON with stable IDs, type, tags, cost, and effect arrays. Zones store card IDs, while runtime card metadata comes from `cardDb`.

## Effect runner concept
A small effect runner resolves card effects in sequence. The first pass supports deterministic core operations (`draw`, resource changes, zone moves, acquisition, and simple conditionals).

## Future asymmetric civilization support
Civilizations can be modeled as start-deck presets, passive modifiers, and card pools keyed by civilization ID. Engine state remains generic while data defines asymmetry.

## Future bot/solo support
Bot behavior can consume exposed move/state APIs to evaluate legal actions and prioritize resource curves, market priorities, and round pacing.

## Future save/resume support
Persist full `GameState` snapshots (including log and round) to local storage or server-backed storage and rehydrate through setup/load helpers.

## Canonical turn lifecycle contract
The multiplayer loop uses an explicit five-phase lifecycle per active player turn:

1. action execution
2. acquire resolution
3. cleanup
4. reshuffle/refill checks
5. turn handoff

Implementation mapping:
- `playCard` and `acquireCard` handle phases 1-2.
- `onTurnEnd` performs cleanup, then deterministic reshuffle/refill checks, then handoff logging and round increment.
- Deck reshuffle and market refill both consume the injected RNG path (`ctx.random?.Number`) and never rely on implicit `Math.random()` in deterministic play.

The setup pipeline explicitly initializes both visible market slots and reserve refill source so placeholder 2-player matches can run for multiple rounds without undefined market transitions.
