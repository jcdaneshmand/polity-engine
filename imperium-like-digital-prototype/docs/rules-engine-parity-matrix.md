# Rules Engine Parity Matrix

Use this matrix to drive runtime-contract parity with Imperium: Horizons while keeping official/private data out of the public repo. The matrix is intentionally public-safe: it names engine contracts, placeholder tests, and local-private-data readiness, but does not reproduce official card text, card names, art, or rulebook prose.

Primary authority: the publisher's current rulebook and applicable errata. Local notes are implementation guidance, not independent proof of fidelity.
Closed blocking evidence: the [2026-09-05 independent rules-fidelity audit](superpowers/plans/2026-09-05-rules-fidelity-audit.md) reproduced 11 issue groups; the [closure report](superpowers/plans/2026-09-05-rules-fidelity-closure.md) records their repair and the remaining certification limits.
Supporting evidence: `docs/rules-engine-compliance-checklist.md`.
Auditable coverage map: `data/fictional-regression/coverage-map.json`.
Public-safe scenario taxonomy: `data/fictional-regression/scenarios.json`, whose tags are checked by `fictionalScenarioSmoke.test.ts` and summarized by `npm.cmd run smoke:fictional-game`; planned entries are not executable evidence.
Public references used for audit orientation: the Osprey Horizons rulebook PDF, Osprey Trade Routes article, and Osprey compatibility/replacement-card article.

Status values:

- `covered`: named tests already exercise the runtime contract.
- `weak-evidence`: implementation exists, but coverage is too indirect or missing a key public-safe edge.
- `runtime-gap`: committed engine behavior cannot yet express or resolve the public rule contract.
- `private-data-only`: remaining work is local/private transcription, not public engine parity.

## 2026-09-06 Public Improvement Ledger

This ledger narrows the five public-safe improvement tracks to observable contracts. It is the current status source for those tracks; broad `covered` rows below describe existing subsystem evidence and do not override a narrower gap here.

Improvement status values are `implemented/tested`, `reproduced gap`, `source unresolved`, and `out of scope`. A `reproduced gap` may be a behavior defect or a direct-evidence gap. `source unresolved` means implementation must wait for a documented publisher-rule interpretation.

Current public sources, checked 2026-09-06:

- Osprey's Board & Card Games resources page still lists the Imperium: Horizons rulebook and the large/small corrected-card PDFs under Imperium: Horizons.
- Rulebook URL: `https://www.ospreypublishing.com/media/1kmpbipw/imperium-horizons-rulebook.pdf`. The file identity recorded by the 2026-09-05 audit is SHA-256 `42D84C877195B77C8BB71DF12D1C3D6E690ADBE47EB3C38BCE28D4888CA36520`; the publisher link, rather than the file hash, was rechecked on 2026-09-06.
- Large-card errata: `https://www.ospreypublishing.com/media/kcojdogy/042024-imp_hrz_errata_large_cards.pdf`, labeled April 2024 by the publisher PDF.
- Small-card errata: `https://www.ospreypublishing.com/media/olxpupe5/042024-imp_hrz_errata_small_cards.pdf`, labeled April 2024 by the publisher PDF.
- Printed rulebook pages currently owning these expectations: payment pp. 14 and 39; Solstice p. 16; immediate Collapse p. 17; solo opponent handling p. 30; scoring pp. 17 and 31. The audit document records the rendered-symbol review. No official card text or images are copied here.

Source-backed expected-state anchors:

- `SRC-01`: when a public rule treats the solo Bot as the opposing civilization, recipient discovery must include it; a confirmed imposed draw removes the applicable Bot-deck card to Bot discard without human reshuffle behavior (p. 30; audit R21-R22/R41).
- `SRC-02`: a Solstice recipient orders applicable owned and incoming effects while original source ownership remains intact; an interruption resumes at the next unresolved effect (p. 16; audit R13/R29).
- `SRC-03`: removing the final shared Unrest causes immediate Collapse and no later effect sentence mutates state (p. 17; audit R20/R30-R31).
- `SRC-04`: a legal payable cost remains the cost even if a later benefit cannot happen; affordability and outcome are separate checks (pp. 14 and 39; audit R08-R12).
- `SRC-05`: fixed/conditional VP is not subject to the human variable-card cap; Bot and human valuation remain distinct (pp. 17 and 31; audit R14-R19/R23-R25).
- `SRC-06`: normal multiplayer rules remain in force in solo unless the solo section replaces them. A Steal therefore treats the Bot as the opponent and takes up to the named amount without resource substitution; an explicit if-unable clause remains a separate branch (pp. 30 and 39; S01).
- `SRC-07`: cards the Bot gains, including cards gained through Take Unrest, go on top of the Bot deck in gain order with the first gained card lowest among the newly gained cards. Emptying the shared Unrest pile still causes immediate Collapse (pp. 17 and 30; S02/R42).
- `SRC-08`: Recall moves the most recently played eligible Bot Region to the top of its deck; Abandon moves that Region to Bot discard. With no eligible Region, no card moves (p. 30; S03).
- `SRC-09`: whenever a human effect forces or permits the Bot to Draw, the Bot moves cards from the top of its Bot deck to Bot discard. The printed source zone and voluntary wording do not create a Bot choice or redirect the draw, and an empty Bot deck is not reshuffled outside cleanup (p. 30; S04/S07).
- `SRC-10`: the Bot ignores effects that make it Discard or allow it to Return Unrest. These are rule-prescribed ignored effects, distinct from unimplemented target-scoped opcodes (p. 30; S06).
- `SRC-11`: each civilization resolves its Solstice effects, chooses the order of simultaneous effects that apply to it, and completes ordinary Solstice before end-of-Solstice processing. Source ownership is therefore retained while the affected civilization remains the chooser/recipient (p. 16; T01-T04).
- `SRC-12`: the engine rechecks that a card remains in its owner's play, Power, or State area before resolving that card's later ordered effect. This is an implementation inference from the rulebook's zone-qualified Solstice instruction, not quoted card text: once an earlier ordered effect removes the source from those areas, its later Solstice text is no longer among the effects present to resolve (p. 16; existing `turnLoop.test.ts` source-removal cases; T03).

### Human-to-Bot dispatch policy

The target-scoped effect inventory accepted by the public effect schema is Draw, Gain resource, Steal resource, Take Unrest, Recall Region, and Abandon Region. Choose/Optional are wrappers that preserve the source owner and human decision-maker. `draw_if_able` and Return Unrest can also reach a Bot execution context through nested fallback text. Other opcodes cannot acquire a Bot target merely by supplying `targetPlayerScope`; import and ruleset validation reject that unsupported shape.

| Operation | Classification | Owner / receiver / chooser | Bot destination or result | Empty or terminal policy | Source and evidence |
| --- | --- | --- | --- | --- | --- |
| Gain resource | normal solo rule | human source / Bot receiver / no choice | Bot resource pool | supply shortage gains only what exists | p. 30; R21, S05, S08 |
| Draw and draw-if-able | adapted | human source / Bot receiver / no Bot choice | Bot deck top to Bot discard regardless of named human source zone | stop at empty deck; never reshuffle here | p. 30; R22, R41, S04, S07 |
| Steal resource | normal opponent rule with Bot resource adapter | human source and receiver / Bot resource source / no choice | stolen amount enters the human pool | take as much as possible; explicit if-unable text replaces partial theft when present | pp. 30, 39; S01 |
| Take Unrest / shortage allocation | adapted | human source / human or Bot receiver / triggering human chooses a shortage allocation | top of Bot deck, first gained lowest among new cards | empty/final shared pile causes immediate Collapse and stops later text | pp. 17, 30; R42, S02 |
| Recall Region | adapted deterministic Bot instruction | human source / Bot Region / no choice | most recent eligible Region to Bot deck top | no eligible Region is a legal no-op; invalid explicit card is rejected | p. 30; S03 |
| Abandon Region | adapted deterministic Bot instruction | human source / Bot Region / no choice | most recent eligible Region to Bot discard | no eligible Region is a legal no-op; invalid explicit card is rejected | p. 30; S03 |
| Return Unrest | rule-ignored | human source / Bot context / no choice | no movement | state unchanged | p. 30; S02, S06 |
| Discard | rule-ignored and not target-scoped in the current DSL | human source / Bot context / no choice | no movement | state unchanged | p. 30; schema-validation evidence |
| Any future target-scoped opcode | unsupported until sourced | undefined | none | reject during import/validation; never infer success from a log | S06; `privateCardImport.test.ts`, `nationRulesetValidation.test.ts` |

| ID | Scoped contract | Status | Evidence owner / next proof |
| --- | --- | --- | --- |
| S01 | Human theft targeting the Bot | implemented/tested | `soloHumanInteractions.test.ts` covers zero, partial, exact, surplus, and explicit if-unable behavior |
| S02 | Human Take Unrest targeting the Bot, including final-pile Collapse | implemented/tested | `soloHumanInteractions.test.ts` covers order, shortage allocation, empty/final pile, terminal stopping, and ignored Return Unrest; audit R42 asserts routing |
| S03 | Human Recall/Abandon Region targeting the Bot | implemented/tested | `soloHumanInteractions.test.ts` covers zero, one, multiple, deterministic destination, and invalid explicit targets; Bot has no player garrison/attachment lifecycle to trigger |
| S04 | Voluntary and non-deck draws targeting the Bot | implemented/tested | `soloHumanInteractions.test.ts` covers permitted/imposed semantics, all accepted source labels, empty deck, no reshuffle, and redacted logs |
| S05 | Nested/multi-recipient solo ownership and choice identity | implemented/tested | nested Optional preserves the human chooser/source; all-recipient gain mutates each human/Bot recipient once |
| S06 | Adapted, normal, rule-ignored, and unsupported classification | implemented/tested | dispatch table above plus behavioral and schema-validation tests distinguish all four outcomes |
| S07 | Save/resume during a new solo interaction choice | implemented/tested | `app/src/localGameSave.test.ts` uses the production codec and proves one-time draw/resume with the same human decision owner |
| S08 | Human resource gain and imposed deck draw reach the Bot | implemented/tested | `rulesFidelity.audit.ts` R21-R22/R41 plus `effectRunner.test.ts` |
| T01 | Three- and four-player Solstice recipient ordering | implemented/tested | `solsticeInterruption.test.ts` uses explicit nonnumeric play orders and asserts per-phase recipient traces for both counts |
| T02 | Source owner remains distinct from recipient and chooser | implemented/tested | external source maps, recipient-owned order/draw choices, and self/all/others scope assertions keep all roles distinct |
| T03 | Source removal/eligibility changes during ordered effects | implemented/tested | first/middle/last pause cases plus existing on/end-of-Solstice source-removal regressions prove re-evaluation under SRC-12 |
| T04 | Save/resume at each pending timing boundary | implemented/tested | first/middle/last serialized replays and production-codec order/random-boundary comparison match uninterrupted state |
| T05 | Immediate Collapse at nested/looped/Solstice removals | implemented/tested | nested shortage allocation, recipient loop, and existing Solstice Collapse tests stop all later mutations |
| T06 | Stale, duplicate, malformed, or wrong-actor continuation | implemented/tested | Solstice phase/cursor/source maps validate before mutation; focused tests cover wrong actor, duplicate IDs/submits, missing source map, and malformed continuation |
| T07 | Scoring boundary executes exactly once after resume | implemented/tested | focused engine test proves idempotent finalization; production save inspection preserves one finalization log and result |
| T08 | Undo cannot reveal hidden information across interruptions | implemented/tested | boardgame.io client tests block undo before/after a hidden draw choice while retaining public reversible-action coverage |
| R01 | Current/old/future/unversioned rules compatibility classification | implemented/tested | engine-owned classifier plus local and server tests accept only rulesVersion 3/stateVersion 1 and reject envelope/state disagreement without rewriting source data |
| R02 | Supported shape migration is idempotent and backed up | implemented/tested | version-1 library shape normalization and current-state legacy autosave import are idempotent; first mutation preserves the original library; no semantic rules migration is claimed |
| R03 | One malformed/incompatible slot cannot hide healthy slots | implemented/tested | mixed-slot unit and Chromium tests keep healthy saves usable beside legacy, future, corrupt, and duplicate entries; whole malformed/oversized libraries remain exportable/resettable |
| R04 | Quota, stale revision, concurrent tabs, interrupted migration preserve bytes | implemented/tested | quota, stale-tab revision, Web Lock path, failed migration, and backup-before-write tests preserve the original active or backup bytes |
| R05 | Raw recovery export preserves original version and bytes | implemented/tested | browser downloads prove exact raw-library bytes and reconstructed legacy rulesVersion 2; UI labels the latter as a stored-slot reconstruction |
| R06 | Compatible pending choices resume; unsafe history is refused | implemented/tested | production local codec tests cover solo choice and Solstice order/random/scoring boundaries; G2 malformed-continuation and hidden-draw undo tests reject unsafe history |
| R07 | Incompatible online state rejects moves/events/undo/redo across restart | implemented/tested | guarded default memory and FlatFile stores plus direct boardgame.io Master lifecycle tests reject move/event/undo/redo/sync/connection mutations; FlatFile restart retains the legacy record unchanged |
| R08 | Authorized recovery does not expose hidden/private state | implemented/tested | owner-directed local raw exports remain separate from public diagnostics; lobby emits only coarse compatibility; existing transport spectator redaction and privacy-marker browser checks remain green; raw server fetch has no public endpoint |
| F01 | Executable progression scenario | reproduced gap | Current fixture scenario is smoke-level, not a full typed walkthrough |
| F02 | Executable Trade/payment scenario | reproduced gap | Listed as `planned_runtime_expansion`; add production-move runner and independent assertions |
| F03 | Executable reaction/Region/resume scenario | reproduced gap | Listed labels are not executed semantic checkpoints |
| F04 | Executable human-to-Bot scenario | reproduced gap | Depends on G1; no complete public solo scenario currently runs |
| F05 | Normal endgame with independently calculated score | reproduced gap | Existing scoring tests are focused; add full scenario arithmetic |
| F06 | Immediate-Collapse terminal scenario | reproduced gap | Add full trace proving no trailing effects |
| F07 | Complete solo and two-player games | reproduced gap | Stress/practice evidence does not cover both promised complete fixture games |
| U01 | Payment preview matches authoritative charge | reproduced gap | `payments.ts` validates/charges; no shared typed preview contract |
| U02 | Legal targets and disabled reasons match engine acceptance | reproduced gap | Existing selector evidence is broad; add parity cases for G1-G4 actions |
| U03 | Ordered public resource/effect feedback | reproduced gap | Current human logs are not a structured UI feedback contract |
| U04 | Pure scoring breakdown sums to final score without mutation | reproduced gap | `scorePlayer` participates in lifecycle behavior; extract/prove pure contributions |
| U05 | Ordering UI avoids factorial action generation | reproduced gap | `orderedPermutations` eagerly expands Solstice/look/return orders |
| U06 | Keyboard/controller/touch/focus across new flows | reproduced gap | Existing controls need the specified recovery/order/resume paths and viewports |
| U07 | Feedback and diagnostics preserve hidden information | reproduced gap | Extend player-view/spectator/support assertions to all new data |
| O01 | Official card/nation/Bot-table completeness and balance | out of scope | Requires separately authorized private data; no public improvement may claim it |

## Current Gap Snapshot

| Bucket | Status | Next gate |
| --- | --- | --- |
| Local QA/playtest | Baseline complete on `agent/public-fixtures-next` and continued by `agent/remaining-gaps-rules-playability` | Keep local browser QA, fictional smoke, multiplayer smoke, typecheck, and app/server/engine tests green before major changes. |
| Rules parity | The 11 audited finding groups plus G1 solo-recipient, G2 timing, and G3 recovery/compatibility scopes are repaired: all 42 independent public checks and 1,590 engine regressions pass; scenario and feedback rows remain open | Keep `npm.cmd run verify:rules` mandatory; close each remaining scoped ledger row with behavioral evidence. |
| Playability | Core local play, online lobby/rejoin, isolated save recovery, exact owner backup, and compatible import/export are browser-verified; incompatible online matches are visibly read-only | Execute complete fictional scenario games in G4, then improve feedback and controls in G5. |
| Hosted release | Deferred | Prove the actual public origin with hosted smoke and hosted two-context browser QA. |
| Private data | Final gate only | Run local `private:gate` only after public-safe and hosted gates pass; convert any runtime discovery to public-safe fixtures first. |

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
| 6 | Private data completeness | private-data-only | Excluded from runtime parity; local `private:gate`, tracker, and completeness reports remain the path for transcription. |

## Current Runtime Parity Backlog

1. Keep private card, nation, and Bot table transcription out of the public repo; classify data-only omissions as `private-data-only`.
2. Keep `data/fictional-regression/coverage-map.json` aligned with this matrix; `rulesParityCoverage.test.ts` fails if non-private rows lack public-safe evidence or runtime gaps lack reproduction plans.
3. Continue auditing this matrix after each rulebook or private-import sweep; downgrade any row to `weak-evidence` or `runtime-gap` only when a concrete rule contract lacks direct public-safe coverage.
4. Treat rows marked `covered` as regression surfaces: any behavior change touching those rows must update the named tests, the coverage map, and checklist evidence.
5. Keep unsupported solo recipient adapters explicit: the G1 target-scoped allowlist is source-backed and behaviorally covered; any future target-scoped opcode must fail import/validation until its solo policy is sourced and tested.

## Closed During 2026-06-04 Follow-up Pass

- Added public-safe effect support for card-effect-created Free Play, including hand-card choice, optional state-requirement bypass where imported, printed resource-cost preservation, once-per-card-per-turn tracking, nested play resolution, source-effect resume, and UI pending-choice exposure.
- Added public-safe Garrison exclusion through normalized `cannot_be_garrisoned` / `not_garrisonable` tags in direct `garrison_card` resolution and pending choices.
- Generalized targeted Attack protection beyond Take-Unrest to supported targeted card-backed effects while preserving undefendable non-card nation/ruleset effects.
- Added direct `draw.upTo` support and named tests for voluntary zero, partial, or full draw-count choices.
- Added direct `draw_if_able.upTo` support and named tests for voluntary zero, partial, or full draw-if-able choices without reshuffling.
- Added selected discard-card cost filters by suit icon and card type, with runtime, ruleset-validation, and private-import evidence.
- Added player-resource-to-Market-card movement through `move_resource_to_market`, with pending-choice, resume, marker-mirroring, import, validation, and UI move-map evidence.
- Added look-and-take hidden-deck movement through `look_take_card`, with selected take, return-order, resume, import, validation, and UI move-map evidence.
