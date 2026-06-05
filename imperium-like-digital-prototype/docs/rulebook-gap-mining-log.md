# Rulebook Gap Mining Log

This log records public-safe rulebook contract scans used to find runtime gaps. It intentionally avoids official card names, exact card text, artwork, scans, and proprietary transcription. Page references are for local audit orientation only.

## 2026-06-04 Dynamic Targeting Pass

Scan method:

- Extracted text from `reference/imperium-horizons-rulebook.pdf` with `pypdf`.
- Ranked pages by overlap of high-risk contract patterns: dynamic player scopes, optional choices, fallbacks, timing words, hidden-info verbs, zone mutation verbs, resource movement, solo Bot terms, and Trade Routes terms.
- Drilled into overlap snippets where dynamic player scopes intersect with optional choices, per-target fallback, resource movement, or opponent zone choices.
- Compared each candidate against `Effect`, `GameState` pending-choice surfaces, `effectRunner`, `moves`, private-card validation, nation-ruleset validation, and named test evidence.

Findings:

| Contract pattern | Rulebook orientation | Current engine status | Next action |
| --- | --- | --- | --- |
| Dynamic all-player/all-other-player resource gain and Take-Unrest effects | Keyword definition and example cards on pages 7, 12, 28, 35, 36 | Covered by `targetPlayerScope` for `gain_resource` and `take_unrest` | Keep regression tests; use as the model for later target-scope effects. |
| Dynamic optional Draw for other players | Example card text on page 12 | Covered by public-safe `draw` target scopes plus `optionalForTargets` | `effectRunner.test.ts` verifies deterministic target-owned optional Draw choices and resume semantics; import and ruleset validators accept the shape. |
| Dynamic Steal from each other player with per-target fallback | Example card text on pages 7-8 | Covered by scoped `steal_resource` plus per-target `ifUnable` effects | `effectRunner.test.ts` verifies scoped stealing and fallback per target; import and ruleset validators accept the shape. |
| Dynamic opponent Region choices | Example card text on page 28 | Covered by targeted `recall_region`/`abandon_region` choices | `effectRunner.test.ts` verifies opponent-owned Region choices that resume under the original resolver; import and ruleset validators accept the shape. |
| Attack protection / ignored targeted attack effects | Keyword clarification on page 36 | Covered for supported targeted card-backed Attack effects | `effectRunner.test.ts` verifies protected players ignore targeted Take-Unrest and Steal-resource attack effects; import and ruleset validators accept `attackTargeted` only on supported effect shapes. |

Audit notes:

- The dynamic Region-choice finding is a separate runtime contract from targeted Take Unrest: it requires a pending choice owned by each affected opponent, not an automatic mutation.
- Attack protection is modeled as an explicit target-level ignore contract for targeted card-backed Attack effects, using a public-safe effect flag and either a player protection flag or a visible persistent protection tag.
- No private card data is needed to test these contracts; placeholder cards can express the public-safe shape.

## 2026-06-04 Follow-up Keyword And Eligibility Pass

Scan method:

- Re-ranked every rulebook page by overlap between optional/fallback/timing/hidden-zone/setup/Bot terms and dynamic player or negative-eligibility terms.
- Manually reviewed the highest-risk keyword, example-card, solo, variant, and nation-note pages.
- Cross-checked each candidate against `Effect`, move legality, effect-runner pending choices, import validators, nation ruleset validation, named tests, and existing checklist evidence.

Findings:

| Contract pattern | Rulebook orientation | Current engine status | Next action |
| --- | --- | --- | --- |
| Free-playing another card from card text | Keyword reminder and public examples on pages 22, 37, 38 | Covered in this pass | `turnLoop.test.ts` verifies public-safe `free_play_card` choosing an eligible hand card, waiving only the Action cost, preserving printed resource costs, enforcing once-per-card-per-turn tracking, resolving nested text, and resuming the source effect; import, ruleset, and UI-selector tests cover the exposed shape. |
| Card-level exclusion from being garrisoned | Public example card text on pages 18-19 | Covered in this pass | `effectRunner.test.ts` verifies normalized public-safe exclusion tags remove cards from Garrison choices and reject direct `garrison_card` resolution. |
| Attack protection beyond Take-Unrest-only targeted attacks | Keyword clarification on page 36 and nation notes on pages 42, 44 | Covered in this pass | `effectRunner.test.ts` verifies protected players ignore supported targeted card-backed Attack effects and that non-card nation/ruleset effects remain undefendable; import and ruleset validators accept the supported `attackTargeted` shapes. |
| Voluntary "up to N" draw/card-count choices | Public example card text on page 34 and draw wording elsewhere | Covered in this pass | `effectRunner.test.ts`, `privateCardImport.test.ts`, and `nationRulesetValidation.test.ts` cover direct `draw.upTo` and `draw_if_able.upTo` metadata and zero, partial, or full count choices; Draw-if-able choices do not reshuffle. |

Covered during this pass:

- Free-play once-per-card-per-turn is covered for naturally free-play-tagged cards and for card-effect-created Free Play.
- Bot table fallback, partial row resolution, empty Bot/Dynasty deck behavior, and Bot Trade Routes fallthrough are already covered by solo Bot tests and checklist evidence.
- Nation-specific History replacement zones, no-History discard routing, side-area visibility, special bottom Fame timing, short-game exceptions, and campaign outcomes are already covered by setup, scoring, UI, and solo tests.
- Exile token restrictions, garrisoned-card movement, and negative Garrison eligibility tags are covered.
