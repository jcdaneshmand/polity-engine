# Rules Engine Compliance Checklist

Use this checklist before opening any PR that changes engine logic, data, or rules docs.

Primary reference: `docs/rules-engine-notes.md`.
External reference: the public Imperium: Horizons rulebook PDF. Do not copy official prose or card text into this repo.

## Required checks

- [ ] **Legal boundary:** No official card text, art, logos, faction names, or rulebook wording added.
- [ ] **Original data only:** Any new cards/civs/resources are original placeholder content.
- [x] **Card IDs in zones:** Runtime zones store string IDs, not full card objects.
- [x] **Visibility:** Hidden zones expose counts only; Development area and public piles expose face-up card IDs.
- [x] **Determinism:** New randomness is routed through boardgame.io random APIs when in move resolution.
- [x] **Move signatures:** boardgame.io moves use the current callback shape (`{ G, ctx, events, random }`, then args).
- [x] **Turn lifecycle:** End-turn behavior advances framework turn state (not just local state mutation).
- [x] **Draw safety:** Draw loops terminate when no cards are drawable.
- [x] **Draw-if-able safety:** Draw-if-able effects never trigger reshuffle.
- [x] **Nation progression:** Reshuffle adds the current top card from the ordered Nation deck before shuffling discard.
- [x] **Development progression:** After Nation deck exhaustion, reshuffle offers a payable face-up Development card choice and places the chosen card in discard.
- [x] **State/accession timing:** State flip/token movement happens in the reshuffle step required by the rules contract.
- [x] **Market gain semantics:** Acquire and Break through remain separate operations with correct Unrest/resource/refill side effects.
- [x] **Payment semantics:** Payment, removal, stealing, and resource gain are modeled as distinct operations.
- [x] **Effect runner constraints:** Costs/effects handling remains explicit and data-driven; unsupported ops fail clearly.
- [x] **Solstice/endgame:** Changes that can affect round boundaries, scoring, collapse, or Fame deck timing update tests and notes.
- [x] **State-model consistency:** Changes stay aligned with vocabulary and milestone direction in `rules-engine-notes.md`.
- [x] **High-risk areas reviewed:** Consider reshuffle timing, market refill source logic, garrison movement, payment substitution, hidden info, and endgame interrupt implications.

## PR notes requirement

In PR descriptions for engine changes, include a brief "Rules Notes Alignment" section describing which checklist items were touched and how they were satisfied.

## Current Evidence

- Nation progression is covered by `engine/src/tests/progression.test.ts` and `engine/src/tests/privateNationImport.test.ts` cases for preserving listed Nation deck order at setup, adding the top Nation card, progressing when discard starts empty, preserving Nation-before-Development priority, adding separately tracked Accession before Development, and terminal Nation card handling.
- Development progression is covered by `engine/src/tests/progression.test.ts` cases for payable face-up Development choices, optional skip, payment substitution, unpayable/no-development-area skips, card-effect Develop not spending progression tokens, and scoring when the Development area empties.
- State/accession timing is covered by `engine/src/tests/progression.test.ts` cases for accession flips, single two-sided State cards, active State stat refresh, never-Empire exceptions, in-play/terminal accession-style exceptions, and short-game accession Development removal timing.
- Draw safety is covered by `engine/src/tests/progression.test.ts` cases for no drawable cards, unpayable Development, before/after reshuffle interruptions, and failed reshuffle hooks without runaway draw loops.
- Draw-if-able safety is covered by `engine/src/tests/effectRunner.test.ts`; `draw_if_able` draws only from the current draw deck and leaves discard/Nation progression untouched when the deck is empty.
- Card-ID zone storage is enforced by `engine/src/game/state.ts` zone and pending-choice types, by setup/import tests that assert zone arrays contain IDs, and by movement tests that compare zone contents by card ID rather than embedded card objects.
- Visibility is covered by `engine/src/tests/uiSelectors.test.ts` cases for hidden draw/Nation/Bot decks, count-only opponent hands, public Development/History/Exile zones, public small-deck bottom cards, face-up Fame special-bottom timing, and per-player looked-card access.
- Determinism is covered by `engine/src/tests/setupPipeline.test.ts`, `engine/src/tests/progression.test.ts`, `engine/src/tests/soloBotReview.test.ts`, and move-loop tests that route setup shuffles, reshuffles, Bot cleanup, Bot setup, discard-random, Find shuffles, Break through deck search, and Solstice/cleanup continuations through seeded or injected random functions.
- Move signatures and boardgame.io integration are covered by `engine/src/game/game.ts`, which wires moves and turn hooks with the callback-object shape, and by `engine/src/tests/turnLoop.test.ts` cases that call moves with `{ G, ctx, events, random }`, including `events.endTurn` handoff assertions.
- Turn lifecycle is covered by `engine/src/tests/turnLoop.test.ts`, `engine/src/tests/scoring.test.ts`, and `engine/src/tests/soloPracticeModes.test.ts` cases for `endTurnMove` invoking the framework end-turn event only after cleanup/pending choices resolve, Solstice boundary handoff, scoring/collapse interruption, and cleanup continuation.
- Market gain semantics are covered by `engine/src/tests/effectRunner.test.ts` and `engine/src/tests/turnLoop.test.ts` cases for Acquire/Gain taking tucked Unrest, Take/Break through returning tucked Unrest, market-resource collection, market refill, main/small deck fallback, pending market choices, and Break through not firing acquire-only text.
- Payment semantics are covered by `engine/src/tests/effectRunner.test.ts` cases for substitution, direct Goods/Progress costs, removals, stealing, and returns, by `engine/src/tests/progression.test.ts` Development payment-choice cases, and by `engine/src/tests/turnLoop.test.ts` paid action/exhaust selected-payment validation.
- Effect runner constraints are covered by `engine/src/tests/effectRunner.test.ts` cases for unsupported ops, conditional branch failure propagation, explicit-cost filtering for optional/choose-one effects, pending choice interruption/resume, and data-driven keyword effects, plus `engine/src/tests/turnLoop.test.ts` rollback cases when unsupported effects surface through play, exhaust, acquire, Solstice, or nation hooks.
- Nation ruleset validation is covered by `engine/src/tests/nationRulesetValidation.test.ts` cases for supported hook conditions, rulebook-to-engine resource-name normalization, and invalid resource rejection in top-level overrides, nested custom override effects, bot cleanup effects, and hook effect payloads.
- Solstice/endgame timing is covered by `engine/src/tests/turnLoop.test.ts`, `engine/src/tests/fame.test.ts`, and `engine/src/tests/scoring.test.ts` cases for Solstice ordering, choice pause/resume, before/after Solstice hooks, Collapse interruption, normal-scoring final round handoff, scoring finalization pauses, Fame special-bottom-card timing, Bot Fame rewards, and Collapse tie handling.
- State-model consistency is covered by the current typed zone model in `engine/src/game/state.ts`, setup/runtime-card inclusion in `engine/src/setup/setupPipeline.ts`, and `docs/rules-engine-notes.md` sections for stable vocabulary, state-shape priorities, and hidden-information policy.
- High-risk areas reviewed in this pass include reshuffle/Development/State timing, draw-if-able safety, market refill fallback, Acquire versus Break through side effects, payment substitution and resource operations, garrison host movement, passive/Solstice timing, Fame bottom-card availability, scoring exclusions, hidden-info selectors, and solo Bot setup determinism.
