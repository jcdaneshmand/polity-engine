# Rules Engine Parity Matrix

Use this matrix to drive runtime-contract parity with Imperium: Horizons while keeping official/private data out of the public repo. The matrix is intentionally public-safe: it names engine contracts, placeholder tests, and local-private-data readiness, but does not reproduce official card text, card names, art, or rulebook prose.

Primary local contract: `docs/rules-engine-notes.md`.
Supporting evidence: `docs/rules-engine-compliance-checklist.md`.
Auditable coverage map: `data/fictional-regression/coverage-map.json`.
Public-safe scenario taxonomy: `data/fictional-regression/scenarios.json`, enforced by `fictionalScenarioSmoke.test.ts` and summarized by `npm.cmd run smoke:fictional-game`.
Public references used for audit orientation: the Osprey Horizons rulebook PDF, Osprey Trade Routes article, and Osprey compatibility/replacement-card article.

Status values:

- `covered`: named tests already exercise the runtime contract.
- `weak-evidence`: implementation exists, but coverage is too indirect or missing a key public-safe edge.
- `runtime-gap`: committed engine behavior cannot yet express or resolve the public rule contract.
- `private-data-only`: remaining work is local/private transcription, not public engine parity.

## Current Gap Snapshot

| Bucket | Status | Next gate |
| --- | --- | --- |
| Local QA/playtest | Baseline complete on `agent/public-fixtures-next` and continued by `agent/remaining-gaps-rules-playability` | Keep local browser QA, fictional smoke, multiplayer smoke, typecheck, and app/server/engine tests green before major changes. |
| Rules parity | Matrix rows are broadly covered and now linked to an auditable coverage map; remaining risk is richer runtime scenario evidence rather than known public runtime gaps | Expand public-safe runtime scenarios for the planned probe buckets in `data/fictional-regression/scenarios.json`. |
| Playability | Core local play, online lobby, rejoin, save/resume, and import/export baselines exist | Add a human playtest checklist, public-safe diagnostics, and broader browser QA against setup and board states. |
| Hosted release | Deferred | Prove the actual public origin with hosted smoke and hosted two-context browser QA. |
| Private data | Final gate only | Run local private preflight/import/completeness only after public-safe and hosted gates pass; convert any runtime discovery to public-safe fixtures first. |

## Matrix

| Priority | Contract area | Status | Evidence or next action |
| --- | --- | --- | --- |
| 1 | Legal boundary and public-safe placeholder fixtures | covered | `docs/legal-boundary.md`, private import tests, and committed placeholder fixtures preserve the no-official-content boundary. |
| 1 | Card IDs in all runtime zones | covered | `engine/src/game/state.ts`, setup/import tests, and movement tests compare zone contents by ID. |
| 1 | Hidden information and owner-visible zones | covered | `uiSelectors`, `uiSelectionModel`, setup metadata, History replacement, Accession bottom-card, and looked-card tests. |
| 1 | Setup pipeline determinism | covered | `setupPipeline.test.ts`, `commonsDeckConstruction.test.ts`, and seeded/random-injected move tests. |
| 1 | Commons replacement policy, including direct Horizons replacement metadata | covered | `commonsSetup.test.ts` covers nation-conflict replacement, group replacement, setup reporting, and direct `replacementForCardId` substitution; `commonsReplacementPolicy.test.ts` covers freshness ordering for `prefer_latest`. |
| 1 | Trade Routes-required Commons, nation/ruleset gating, and mutually exclusive alternates | covered | `commonsSelection.test.ts`, `commonsSetup.test.ts`, `setupPipeline.test.ts`, `tradeRoutesModule.test.ts`, and expansion-toggle tests cover expansion-gated Commons, imported ruleset requirements, and alternate-card suppression. |
| 1 | Nation setup, Accession, no-Nation/no-Development tags, and Development progression | covered | `progression.test.ts`, `setupPipeline.test.ts`, `variants.test.ts`, and current checklist evidence. |
| 1 | Short-game setup exceptions and scoring timing | covered | `variants.test.ts`, `progression.test.ts`, `setupPipeline.test.ts`, `soloBotReview.test.ts`, and scoring option snapshot tests. |
| 2 | Effect DSL expressiveness for human card text | covered | `Effect` union plus `privateCardImport.test.ts`, `nationRulesetValidation.test.ts`, `effectRunner.test.ts`, `turnLoop.test.ts`, and `uiSelectionModel.test.ts` cover accepted human effect op shapes, nested effects, conditions, Treat As, keyword movement, dynamic `targetPlayerScope` for `draw`/`gain_resource`/`steal_resource`/`recall_region`/`abandon_region`/`take_unrest`, per-target optional Draw choices, voluntary `draw.upTo` and `draw_if_able.upTo` count choices, filtered selected discard-card costs, player-resource movement onto distinct Market cards, look-and-take hidden-deck movement, per-target Steal fallback branches, opponent-owned Region choices with resume semantics, card-effect-created `free_play_card` with nested play/source resume, and card-level Garrison exclusion through public-safe tags. |
| 2 | Attack protection and ignored targeted attack text | covered | `effectRunner.test.ts`, `privateCardImport.test.ts`, and `nationRulesetValidation.test.ts` cover targeted card-backed Attack effects marked with `attackTargeted` for both Take-Unrest and Steal-resource shapes; players with an attack-protection flag or visible persistent `attack_protection` tag ignore those targeted card effects, while non-card nation/ruleset effects remain undefendable. |
| 2 | Ruleset override/hook expressiveness | covered | `nationRulesetValidation.test.ts` accepts every current override family and hook condition shape; `nationHookCore.test.ts`, setup, reshuffle, cleanup, Solstice, scoring, and collapse tests cover runtime resolution. |
| 2 | Bot table effect expressiveness | covered | `BotEffectOp` union plus `botTableCli.test.ts` accepts every current Bot state-table op shape through import and private-entry validators; Bot state table, Bot Trade Routes resolver, and solo Bot review tests cover runtime resolution. |
| 3 | Cost-before-benefit and payment substitution | covered | `effectRunner.test.ts`, `progression.test.ts`, and `turnLoop.test.ts` cover selected payments, Progress/Goods substitution, overpay rejection for paid actions/Exhaust/Development/Market acquisition, finite supply, filtered and unfiltered discard-card costs, player-resource-to-Market placement before later benefits, and resource movement separation. |
| 3 | Reactive Exhaust timing between effect sentences | covered | `turnLoop.test.ts`, `effectRunner.test.ts`, `tradeRoutesModule.test.ts`, `progression.test.ts`, `soloBotReview.test.ts`, and `scoring.test.ts` cover card play, resource gain/stealing, Take Unrest, Acquire, Break through, market-resource collection, Trade/Profit, source-suited resource gain, cleanup/reshuffle/Bot/scoring continuations, and Solstice/Revolt/Innovate exclusion. |
| 3 | Pending choices and resume effects | covered | `turnLoop.test.ts`, `effectRunner.test.ts`, `progression.test.ts`, `tradeRoutesModule.test.ts`, and `uiSelectionModel.test.ts` cover optional/choose-one, Draw, Find, Acquire, Gain/Take, Break through, Exile, Garrison, Recall/Abandon, Develop, Trade, Discard, Return, Free Play, Give, Swap, Look, Return Exhaust token, Unrest allocation, and Solstice order, including resumed remaining effects and lifecycle continuations. `fictionalScenarioSmoke.test.ts` adds public-safe integration evidence using the `data/fictional-regression` fixture pack. |
| 3 | Rollback after failed nested hooks/effects | covered | `turnLoop.test.ts`, `progression.test.ts`, `tradeRoutesModule.test.ts`, and `soloBotReview.test.ts` cover failed before/after play and acquisition hooks, tucked-Unrest hooks, Exile/Take-Unrest hooks, pending choice restore, Development hook restore, Trade choice failure, and paid Bot Trade Routes refund/rollback. |
| 4 | Market slots, tucked Unrest, resources, and refill source decks | covered | `effectRunner.test.ts`, `turnLoop.test.ts`, `commonsDeckConstruction.test.ts`, `setupPipeline.test.ts`, `tradeRoutesModule.test.ts`, and `soloBotReview.test.ts` cover legacy/structured marker mirroring, tucked-Unrest take/return, player-resource placement onto Market cards, resource collection, refill small-deck/main fallback, imported suit icons, and ineligible Unrest/Region tucks. `fictionalScenarioSmoke.test.ts` adds public-safe integration evidence using the `data/fictional-regression` fixture pack. |
| 4 | Fame deck and special bottom-card timing | covered | `fame.test.ts`, `effectRunner.test.ts`, `turnLoop.test.ts`, `scoring.test.ts`, and `soloBotReview.test.ts` cover ordinary Fame availability, Look/Draw/Gain/Return Fame, special-bottom side A/B resolution, per-player special resolution, free Develop, active State side, Bot rewards, and scoring triggers. |
| 4 | Exile, History, History replacement, and no-History routing | covered | `effectRunner.test.ts`, `turnLoop.test.ts`, `setupPipeline.test.ts`, `scoring.test.ts`, `exile.test.ts`, and `tradeRoutesModule.test.ts` cover Exile eligibility, History replacement/no-History routing for setup, Find, Exile, Return Unrest/Fame, Trade Route Profit, and scoring/collapse. |
| 4 | Garrison host/child movement and resource collection | covered | `effectRunner.test.ts`, `regions.test.ts`, `zones.test.ts`, `turnLoop.test.ts`, and `scoring.test.ts` cover Garrison, Garrison exclusion tags, Recall/Abandon, Find, Exile, History movement, scoring-zone children, host-only versus child-only targeting, and resource reactive windows. |
| 4 | Return/Give/Swap/Look/Find keyword edge cases | covered | `effectRunner.test.ts`, `turnLoop.test.ts`, and `scoring.test.ts` cover pending choices, source zones, multi-card/opponent options, hidden-deck shuffle-after-move, Accession/Fame look exclusions, look-and-take top-card choices, suit/icon treatment, and scoring-time Return choices. |
| 5 | Solo Bot setup, Dynasty, difficulty, scoring, and campaign modifiers | covered | `soloBotReview.test.ts`, `setupPipeline.test.ts`, `scoring.test.ts`, `campaign.test.ts`, `commonsSelection.test.ts`, `commonsSetup.test.ts`, and `gameOptions.test.ts` cover Bot slots/resources by difficulty, Dynasty setup/sorting/accession/short-game movement, Bot scoring, Supreme Ruler campaign options, and campaign Commons modifiers. |
| 5 | Solo Bot table resolution, fallback, payment/refund, and Trade Routes rows | covered | `soloBotReview.test.ts`, `tradeRoutesModule.test.ts`, `botTableCli.test.ts`, and `scoring.test.ts` cover Bot state-table triggers, current-table recursion, if-unable fallback chains, paid row refund/rollback, human-facing rows, Bot Trade Routes Commerce/Profit/end-of-turn rows, and source-suited reactive windows. |
| 5 | Practice mode market churn and scoring timing | covered | `soloPracticeModes.test.ts`, `turnLoop.test.ts`, `setupPipeline.test.ts`, and `scoring.test.ts` cover practice setup Exile, 12-token churn clock, structured Market marker mirroring, optional tokenless-Market Exile, cleanup resume, and final-turn Solstice-before-scoring timing. |
| 5 | Campaign result/progression metadata | covered | `campaign.test.ts`, `setupPipeline.test.ts`, `scoring.test.ts`, `commonsSelection.test.ts`, `commonsSetup.test.ts`, and `gameOptions.test.ts` cover win/loss progression, reward/return choices, loss resource carryover, setup application, Supreme Ruler normalization/extras, and gameover campaign outcome snapshots from scoring and Collapse. |
| 6 | UI move availability, hidden-info selectors, and public move map | covered | `uiSelectors.test.ts`, `uiSelectionModel.test.ts`, `turnLoop.test.ts`, and `privateCardEntryNavigation.test.tsx` cover owner-visible/hidden zones, looked-card privacy, pending-choice banners/actions, action availability, direct Market Acquire/region move suppression, and published pending-choice resolver moves. |
| 6 | UI as playable rulebook explanations | covered | `uiSelectionModel.test.ts`, `BoardLayout.test.tsx`, `local-browser-qa.test.mjs`, and `rulesParityCoverage.test.ts` tie current-task labels, blocked-action reasons, rule provenance labels, zone hierarchy metadata, and player-expectation browser QA to public-safe evidence in `data/fictional-regression/coverage-map.json`. |
| 6 | Private data completeness | private-data-only | Excluded from runtime parity; local-only tracker and completeness scripts remain the path for transcription. |

## Current Runtime Parity Backlog

1. Keep private card, nation, and Bot table transcription out of the public repo; classify data-only omissions as `private-data-only`.
2. Keep `data/fictional-regression/coverage-map.json` aligned with this matrix; `rulesParityCoverage.test.ts` fails if non-private rows lack public-safe evidence or runtime gaps lack reproduction plans.
3. Continue auditing this matrix after each rulebook or private-import sweep; downgrade any row to `weak-evidence` or `runtime-gap` only when a concrete rule contract lacks direct public-safe coverage.
4. Treat rows marked `covered` as regression surfaces: any behavior change touching those rows must update the named tests, the coverage map, and checklist evidence.

## Closed During 2026-06-04 Follow-up Pass

- Added public-safe effect support for card-effect-created Free Play, including hand-card choice, optional state-requirement bypass where imported, printed resource-cost preservation, once-per-card-per-turn tracking, nested play resolution, source-effect resume, and UI pending-choice exposure.
- Added public-safe Garrison exclusion through normalized `cannot_be_garrisoned` / `not_garrisonable` tags in direct `garrison_card` resolution and pending choices.
- Generalized targeted Attack protection beyond Take-Unrest to supported targeted card-backed effects while preserving undefendable non-card nation/ruleset effects.
- Added direct `draw.upTo` support and named tests for voluntary zero, partial, or full draw-count choices.
- Added direct `draw_if_able.upTo` support and named tests for voluntary zero, partial, or full draw-if-able choices without reshuffling.
- Added selected discard-card cost filters by suit icon and card type, with runtime, ruleset-validation, and private-import evidence.
- Added player-resource-to-Market-card movement through `move_resource_to_market`, with pending-choice, resume, marker-mirroring, import, validation, and UI move-map evidence.
- Added look-and-take hidden-deck movement through `look_take_card`, with selected take, return-order, resume, import, validation, and UI move-map evidence.
