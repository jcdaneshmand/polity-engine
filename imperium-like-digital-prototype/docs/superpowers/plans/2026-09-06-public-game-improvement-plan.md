# Public-Safe Game Improvements: Sol 5.6 Execution Plan

Date: 2026-09-06
Status: COMPLETE. G0-G5 and the final public-safe integration review are verified locally.
Audience: Sol 5.6 continuing this repository without the preceding conversation.

## 1. Outcome and Authorization

Complete five improvements in order: solo interactions, timing/resume correctness, save recovery and online compatibility, executable fictional playtests, and player feedback/accessibility. All work must be possible without entering private data.

The user requested this plan file. This document is not itself permission to start implementation, create background tasks, commit, push, or deploy. Once the user authorizes execution, pursue the stages sequentially. When explicitly asked to pursue them as goals, create an explicit goal for the current stage only; finish its acceptance criteria before moving to the next. Do not infer a token budget or change the selected model.

Success means supported mechanics work through actual game and UI paths, results have independently justified expectations, saves remain recoverable, and verification is reproducible. It does not mean official card-by-card fidelity or official nation balance is certified.

## 2. Operating Contract

- Repository: `C:\Repos\polity-engine`.
- Run npm commands from `C:\Repos\polity-engine\imperium-like-digital-prototype` using PowerShell and `npm.cmd`.
- All paths below are relative to that npm workspace unless prefixed with `../`.
- Read applicable repository instructions, then inspect the current worktree before editing. There are already extensive modified source files, untracked audit documents/tests, and deleted temporary PDF/image artifacts. Preserve all unrelated work; do not clean, reset, or restore it.
- Use existing TypeScript, Vitest, React, boardgame.io, storage, and controller patterns. Add small helpers only for demonstrated shared behavior.
- Keep official PDFs, extracted card text, artwork, private CSVs, credentials, account data, and private screenshots out of commits and public artifacts. Tests and browser evidence use original synthetic data and disposable local accounts only.
- Do not run private imports or populate missing private datasets. Inspect existing status-check behavior before running an aggregate command; do not expose any discovered local private content in logs or reports.
- Use public publisher rules and errata as authorities. Record source URL, document revision, page/section, checked date, paraphrased interpretation, and test IDs. Keep downloaded PDFs in ignored scratch storage. Visually inspect symbol-dependent rules; extracted text alone is insufficient.
- A logged unsupported operation is not implemented behavior. A documented rule-prescribed no-op is acceptable only with source-backed tests. Ambiguity stays explicitly unresolved; do not invent a Bot policy to make tests green.
- Do not implement destructive save migrations. Preserve original recoverable data before any supported migration. Unknown/future versions must not be interpreted as current.
- No live accounts, hosted writes, commits, pushes, or deployment are needed for these goals. Obtain explicit scope for any later release.

## 3. Inspected Starting Point

These observations come from source inspection, not a new test run. Recheck them at execution time.

| Area | Current evidence | Consequence for this plan |
| --- | --- | --- |
| Solo | `engine/src/cards/effectRunner.ts` and prior closure notes distinguish adapted effects from `SoloRecipientUnsupported` | Exercise actual Bot state changes; diagnostic visibility alone is not completion |
| Timing | `engine/src/game/turn.ts` carries Solstice cursors and source-player mappings across pending choices | Verify source ownership separately from effect recipient through nested resolution and resume |
| Local saves | `app/src/saveLibrary.ts` validates every slot with the playable import path; one invalid slot can fail library loading | Separate inspection/recovery from permission to resume, with per-slot isolation |
| Compatibility | Local envelopes use rules version 2; `server/src/boardgameStorage.ts` currently constructs ordinary FlatFile storage | Audit actual online state and all mutation entry points, not just local envelope validation |
| Fictional scenarios | `data/fictional-regression/scenarios.json` contains planned entries; `engine/src/tests/fictionalScenarioSmoke.test.ts` checks tags plus a small set of smoke actions | Listed scenarios and assertion labels are not proof that each scenario ran |
| Ordering controls | `app/src/ui/controller/selectionModel.ts` recursively materializes all permutations for several pending order choices | Replace factorial action generation without losing legal orders or input-device support |
| Verification | `package.json` chains `verify:rules` into `verify:pre-private` and `verify:improvements` | Preserve mandatory rules gating and capture complete command outcomes |
| Targeted tests | `engine/scripts/pretest-check.mjs` invokes its own Vitest command without forwarding CLI arguments | Do not assume `npm test -w engine -- <file>` runs only that file |

Read these existing documents as historical evidence, not automatic certification:

- `docs/superpowers/plans/2026-09-05-rules-fidelity-audit.md`
- `docs/superpowers/plans/2026-09-05-rules-fidelity-repair-plan.md`
- `docs/superpowers/plans/2026-09-05-rules-fidelity-closure.md`
- `docs/rules-engine-notes.md`
- `docs/rules-engine-parity-matrix.md`
- `docs/save-resume-ux-design.md`

Historical green test counts must not be reported as newly verified. Existing tests may encode an incorrect interpretation. Reopen inaccurate completion claims with a dated addendum rather than deleting history.

## 4. Execution Order and Tracking

Run G0, G1, G2, G3, G4, G5, then the final integration review. G2 supplies interruption fixtures used by G3. G1-G3 stabilize mechanics and persistence used by G4. G4 provides realistic flows for G5. Shared versioning decisions begin in G0, before persisted state changes.

All statuses start pending:

| Stage | Status | Evidence / remaining blocker |
| --- | --- | --- |
| G0 Baseline and source map | Verified | Baseline gates green; 39 scoped rows, source anchors, persistence inventory, version policy, and closure qualification recorded |
| G1 Solo interaction completion | Verified | Source-backed Bot dispatch policy implemented; focused, codec, engine, audit, and typecheck gates green |
| G2 Timing and interruption fidelity | Verified | Explicit 3/4-player traces, malformed-continuation guards, codec replay, Collapse/scoring, seeded replay, and undo gates green |
| G3 Recovery and online compatibility | Verified | Per-slot recovery, byte-preserving backup/reset, canonical local/online guards, FlatFile restart refusal, lifecycle coverage, and synthetic browser walkthrough are green |
| G4 Executable fictional playtests | Verified | Typed F01-F08 catalog, 17 checkpoints, original role decks, independent score arithmetic, complete solo/2P terminals, fail-closed meta-tests, report smoke, and click-driven browser F06 are green |
| G5 Feedback and accessible controls | Verified | Canonical payment previews, structured public events, immutable score breakdowns, bounded ordering, input/focus coverage, eight responsive profiles, and privacy tests are green |
| Final integration review | Verified | Both aggregate gates, public synthetic browser/playtest flows, production rehearsal, asset limits, repository hygiene, and private-data boundary checks passed |

Update this ledger after each stage, not all at the end. Use Pending, In Progress, Blocked, or Verified as document statuses. Follow the actual goal tool's own rules for tool status transitions; a document blocker does not automatically authorize marking a tool goal blocked.

For each stage append an evidence record containing:

```text
Stage and date:
Base commit and pre-existing worktree changes:
Files changed in this stage:
Rule/source decisions and test IDs:
Commands, working directory, exit codes, test totals:
Failure reproduced before fix and passing evidence after fix:
Browser checks, viewport/input mode, public-safe artifact paths:
Compatibility/version decisions:
Known limitations or unresolved rules:
Next concrete action:
```

New filenames proposed below are suggestions, not claims that those files already exist. Prefer extending an appropriate existing test rather than duplicating it.

## G0. Establish a Trustworthy Baseline

Objective: distinguish known behavior, unresolved rules, and existing failures before implementation.

1. Record `git status --short` and `git rev-parse HEAD` from the repository root. Read the files relevant to G1-G5 and identify existing helpers/tests before designing replacements.
2. Run `npm.cmd run verify:rules` and `npm.cmd run typecheck`. Record full outcomes and separate pre-existing failures from new regressions. Do not fix unrelated failures without explaining why they block this work.
3. Extend the existing parity matrix with rows for every scoped solo operation, timing boundary, compatibility path, fictional scenario, and feedback surface. Give each row a stable ID and status: implemented/tested, reproduced gap, source unresolved, or out of scope.
4. Verify current public publisher rule and errata sources using the existing audit's source references. For each disputed interpretation, write a short source-backed expected-state example before editing production code. Do not choose expectations by copying existing engine output.
5. Inventory persisted state: engine state, local envelope/library, pending choices/continuations, PRNG state, boardgame.io context/plugins, undo/redo history, and online match metadata. Decide where canonical rules and state-format versions live.
6. Decide version policy before changing meaning or shape. Local version 2 is an inspected baseline, not a permanently valid constant. A semantic change may require a new rules version; shape-only changes need a separately reviewed migration. All readers must share compatibility policy, not duplicate magic numbers.
7. Add a dated qualification to historical closure documentation where unsupported logging or listed-only scenarios had been mistaken for completed fidelity.

Exit: baseline outcomes recorded; scoped requirements have source/test owners; version strategy documented. Any unresolved source decision blocks only dependent implementation, not unrelated evidence gathering.

### G0 Persistence Inventory and Version Policy

Inspected 2026-09-06:

| Layer | Current owner and persisted content | Compatibility decision |
| --- | --- | --- |
| Engine semantics | `GameState` in `engine/src/game/state.ts`, including players/Bot, cards/zones/resources, options, logs, scoring/gameover, and all `pending*` continuations | Add one canonical engine rules version in engine-owned code before G1-G3 semantic changes; local/server readers import it |
| Engine shape | The `GameState` TypeScript shape has no persisted runtime format discriminator | Add an engine state-format version only with a validated persisted shape contract; do not infer compatibility from TypeScript compilation |
| Local envelope | `localGameSave.ts`: envelope v1, stateVersion 1, rulesVersion 2, metadata/fingerprint, and boardgame.io snapshot | Keep envelope, state-format, and rules versions independent; do not stamp imported bytes as current |
| Local library | `saveLibrary.ts`: library v2/stateVersion 1/rulesVersion 2, revision, slots, legacyImported | Library structure version governs the container only; each slot is classified independently by its own envelope/state/rules versions |
| Pending engine work | `GameState` contains choices plus lifecycle continuations, resume effects, Solstice cursors/source owners, rollback snapshots, and pending scoring/collapse/cleanup state | Any compatible resume must serialize and validate the complete pending contract, actor/source IDs, and remaining cursor exactly once |
| Randomness | Engine functions receive boardgame.io `random.Number`; production snapshots also carry boardgame.io plugin state | Resume proof compares plugin PRNG state and subsequent outcomes, not just `G` or the setup seed |
| Boardgame.io state | Application saves contain `G`, `ctx`, `_undo`, `_redo`, `plugins`, `_stateID`, and framework metadata where present | Validate authoritative `G` plus context/plugins/history as a coherent snapshot; reject unsafe or mismatched history |
| Online match | boardgame.io storage persists framework match state/metadata; `boardgameStorage.ts` currently returns ordinary FlatFile storage and default memory storage remains framework-owned | Enforce the canonical compatibility policy before every mutation for both storage modes and at reconnect/load; preserve incompatible records read-only |
| Lobby/account metadata | Polity lobby, pregame lobby, account, connection, and result stores are separate server concerns | Do not use lobby display status as the security boundary; do not expose hidden match state or rewrite results while quarantining |

Version rules:

1. A rule-semantic change that can alter legal moves, costs, timing, random consumption, zones, scoring, or terminal outcome increments the canonical rules version unless old state can be proven semantically identical.
2. A persisted shape change increments the state-format version unless a total, deterministic, idempotent migration preserves the original bytes and passes before/after fixtures.
3. Container/library UI changes increment only the library version. They never make an incompatible game playable.
4. Older/future/unknown semantic versions are preserved and refused by the current engine. Historical Action/Exhaust state is not reconstructable, so rules version 1 remains non-migratable.
5. Local and online paths use one engine-owned compatibility function and stable reason codes. Human-facing text may differ, but policy cannot.
6. G1 and G2 must explicitly decide whether their semantic changes require rules version 3 before fixtures are written. G3 implements the shared decision; no reader may duplicate a magic version literal.

### G0 Evidence Record

```text
Stage and date: G0, 2026-09-06 (Verified)
Base commit and pre-existing worktree changes: ef60fb49430e000fb5288d8c5b8e33150a8fbae8; extensive modified rules/app/server files, untracked 2026-09-05 audit artifacts, and deleted ignored PDF/image/log scratch artifacts preserved
Files changed in this stage: this plan; docs/rules-engine-parity-matrix.md; docs/superpowers/plans/2026-09-05-rules-fidelity-closure.md
Rule/source decisions and test IDs: SRC-01 through SRC-05; scoped S01-S08, T01-T08, R01-R08, F01-F07, U01-U07, O01 in the parity matrix
Commands, working directory, exit codes, test totals: npm.cmd run verify:rules (exit 0: 52 files/1540 engine tests plus 1 file/42 audit tests); npm.cmd run typecheck (exit 0: engine, app, server)
Failure reproduced before fix and passing evidence after fix: source inspection reconfirmed unsupported solo logging, whole-library slot validation, planned-only scenarios, unguarded online FlatFile storage, and factorial UI permutations; focused parity-document test passes 2/2
Browser checks, viewport/input mode, public-safe artifact paths: not required for G0; no browser artifact saved
Compatibility/version decisions: canonical engine-owned semantic version; separate state-format and container versions; preserve/refuse unknown semantic versions; no v1 semantic migration
Known limitations or unresolved rules: exact Bot adaptation for theft, Take Unrest, Region movement, voluntary draw, non-deck draw; source removal capture/re-evaluation timing
Next concrete action: close the active G0 goal, then begin G1 by resolving the five source-unresolved Bot recipient policies before production edits
```

## G1. Finish Human-to-Bot Interactions

Objective: every scoped human effect that can target the solo Bot follows a verified normal, adapted, or explicitly ignored public rule.

Primary files: `engine/src/cards/effectRunner.ts`, `engine/src/solo/`, `engine/src/game/resources.ts`, `engine/src/game/unrest.ts`, `engine/src/game/regions.ts`, `engine/src/game/state.ts`, and existing `engine/src/tests/soloBotReview.test.ts` / `effectRunner.test.ts`.

Suggested focused test: `engine/src/tests/soloHumanInteractions.test.ts`.

Implementation sequence:

1. Inventory reachable opcodes and nested targeting: self, chosen opponent, all opponents, each player, and multiple recipients. Include theft, Unrest taking/returning/allocation, Region recall/abandon/movement, optional and imposed draws, non-deck draw sources, and already-supported resource gains.
2. Build a policy table: operation, human meaning, public solo adaptation, source owner, recipient, decision-maker, resource/zone destination, empty-target policy, terminal consequence, rule reference, and tests. Distinguish who chooses from who receives an effect.
3. Write failing behavioral tests for each confirmed gap. Assert precise before/after values, card identities and zones, choice owner/options, and terminal state, not only log text.
4. Implement adaptations through existing resource, Unrest, Region, draw, and terminal helpers. Factor a typed solo-dispatch helper only if it removes existing branching duplication. Never construct a fake human player to receive Bot operations.
5. Preserve source-card identity and owner through nested Choose/Optional and recipient loops. Do not globally rewrite an execution context so that source costs, conditions, or self references acquire the recipient's ownership.
6. Make deterministic Bot decisions only where supported by a cited rule. Preserve actual human choices through the existing serializable pending-choice mechanism. Clearly distinguish an intentionally ignored effect from an unimplemented effect.
7. Reject illegal requests before charging costs or changing state. For legal effects with insufficient resources or no targets, apply the documented rule rather than a generic assumption about partial execution.
8. Check player-view redaction and undo restrictions for any new draw, reveal, or choice. Do not expose Bot deck order through logs, previews, or recovery diagnostics.

Required cases:

| ID | Coverage and observable result |
| --- | --- |
| S01 | Theft at zero, below-request, exact, and above-request resources; verify both parties and source-backed limits |
| S02 | Unrest routing, empty pool, last shared Unrest, return destinations; immediate Collapse stops all later effects |
| S03 | Zero/one/multiple Region candidates, movement destination, attachments/garrisons and triggers as applicable |
| S04 | Optional draw accept/decline or documented Bot adaptation; imposed draw; empty deck; reshuffle and non-deck sources |
| S05 | Nested Choose/Optional and multi-recipient effects with distinct source owner, chooser, and recipient |
| S06 | Adapted, normal, rule-ignored, and truly unsupported branches each have explicit classifications |
| S07 | Save/reload while a new choice is pending; no duplicated payment/draw and no changed decision owner |
| S08 | Existing gain/draw adaptations remain correct; ordinary two-human targeting is unchanged |

Exit: all scoped reachable operations have source-backed behavior and passing tests. No scoped legal interaction is counted complete solely because `SoloRecipientUnsupported` was logged. Broader opcodes outside scope remain explicitly listed, not silently certified.

Verification: focused solo/effect tests, `npm.cmd run verify:rules`, and `npm.cmd run typecheck`.

### G1 Evidence Record

```text
Stage and date: G1, 2026-09-06 (Verified)
Base commit and pre-existing worktree changes: ef60fb49430e000fb5288d8c5b8e33150a8fbae8; extensive pre-existing modified/untracked audit and repair work preserved
Files changed in this stage: engine/src/game/version.ts; engine/src/game/state.ts; engine/src/setup/setupPipeline.ts; engine/src/index.ts; engine/src/cards/effectRunner.ts; engine/src/game/unrest.ts; engine/src/tests/soloHumanInteractions.test.ts; engine/src/audits/rulesFidelity.audit.ts; app/src/localGameSave.ts; app/src/saveLibrary.ts; app/src/ui/setup/SavedGames.tsx; app/src/localGameSave.test.ts; app/src/App.test.tsx; this plan; parity matrix; historical closure addendum
Rule/source decisions and test IDs: SRC-06 through SRC-10; S01-S08. General solo rules govern theft; gained Unrest enters the Bot deck; Region movement follows most-recent Bot instructions; every forced/permitted Draw maps Bot deck to discard without reshuffle; Return Unrest is ignored
Commands, working directory, exit codes, test totals: npx.cmd vitest run --root engine src/tests/soloHumanInteractions.test.ts (exit 0: 22); npx.cmd vitest run --root app src/localGameSave.test.ts src/App.test.tsx (exit 0: 31); npm.cmd run test -w engine (exit 0: 53 files/1,562); npm.cmd run audit:rules (exit 0: 42); engine/app typechecks (exit 0)
Failure reproduced before fix and passing evidence after fix: initial focused run exposed a Bot fallback null-player crash and a human draw-up-to continuation shape regression; both were corrected, and all focused/full tests now pass
Browser checks, viewport/input mode, public-safe artifact paths: no browser behavior changed in G1; tests use synthetic fixture IDs only; source PDF remained in ignored tmp/rules-fidelity-audit
Compatibility/version decisions: semantic behavior changed, so engine-owned rulesVersion advanced to 3; new game state and local envelopes are stamped 3; old/unversioned local saves remain byte-preserved and refused pending G3 recovery UX
Known limitations or unresolved rules: Bot attachments/garrisons are not represented by the Bot model and no source instruction requires a player-style attachment lifecycle; future target-scoped opcodes remain validation-rejected; online compatibility is G3
Next concrete action: close G1, then begin G2 with explicit three- and four-player Solstice traces and production-codec interruption comparisons
```

## G2. Prove Timing and Save/Resume Boundaries

Objective: three- and four-player timing, ownership, interruptions, and terminal stopping are correct and reproducible.

Primary files: `engine/src/game/turn.ts`, `engine/src/cards/effectRunner.ts`, `engine/src/game/moves.ts`, `engine/src/game/game.ts`, `engine/src/game/state.ts`, `engine/src/game/scoring.ts`, `engine/src/game/undoPolicy.ts`, `app/src/localGameSave.ts`, and `engine/src/audits/`.

Suggested tests: `engine/src/tests/solsticeInterruption.test.ts` and additions to `app/src/localGameSave.test.ts`.

Implementation sequence:

1. Write small independent event traces for 3-player and 4-player rounds. Define source owner, recipient order, chooser, phase, expected effects, and exact pause/resume point. Include nontrivial seat IDs/order, not just matching array indices.
2. Inspect `createSolsticeOrderChoice`, `runOrderedSolsticeCardEffects`, `runSolsticeForPlayer`, `runSolsticeForAllPlayers`, and `resolveSolsticeOrder`. Verify `sourcePlayerIds` remains meaningful when effects are transformed or resumed.
3. Test source removal, movement, and eligibility changes during an earlier effect. Use public rules to determine whether each later trigger was captured or must be re-evaluated; do not assume either timing model universally.
4. Make continuations explicit serializable data with phase, cursor, source owner/card, recipient/chooser, and remaining work where needed. Avoid runtime closures and hidden mutable module state. Reject stale/duplicate resolutions without advancing the cursor twice.
5. For every pending-choice family reachable in these cases, branch the test: uninterrupted run versus real save export/import and continuation. Use the production codec and include required random/plugin context. A JSON clone of engine G alone is not proof of application resume fidelity.
6. Compare full semantic state, ordered events, PRNG continuation, next legal choices, resources/zones, and terminal outcome. Normalize only documented volatile fields such as timestamps; do not strip away mismatches.
7. Inject immediate Collapse at each shared-pile removal path exercised. Verify subsequent cost, draw, trigger, refill, phase hook, player handoff, and scoring mutations do not run unless the source rules explicitly require them.
8. Add seeded bounded stress coverage after explicit examples. Preserve each failing seed and action trace as a deterministic regression fixture. Stress success supplements, not replaces, independent expected outcomes.

Required cases:

| ID | Coverage and observable result |
| --- | --- |
| T01 | 3- and 4-player recipient/phase ordering, including non-current source owners |
| T02 | Self/all/opponent targeting with source-owned condition/cost distinct from recipient changes |
| T03 | First/middle/last source pause; nested reaction/choice; source removed before later resolution |
| T04 | Resume at every captured interruption, including a pending ordering choice and random draw boundary |
| T05 | Last-Unrest Collapse during nested, recipient-loop, and Solstice effects; no later mutations |
| T06 | Invalid actor, invalid/stale choice, duplicate submit, missing source ID, malformed continuation |
| T07 | Scoring runs at the correct boundary exactly once; loading or inspecting cannot rescore |
| T08 | Hidden-information action cannot be undone into knowledge retention; public reversible behavior preserved |

Exit: explicit expected traces match both uninterrupted and resumed execution; 3-/4-player coverage is real; every discovered failing seed is preserved. Record any format/rules-version changes for G3.

Verification: focused timing/save tests, `npm.cmd run verify:rules`, app tests if codec changed, and `npm.cmd run typecheck`.

### G2 Evidence Record

```text
Stage and date: G2, 2026-09-06 (Verified)
Base commit and pre-existing worktree changes: ef60fb49430e000fb5288d8c5b8e33150a8fbae8; all unrelated pre-existing changes and ignored scratch artifacts preserved
Files changed in this stage: engine/src/game/turn.ts; engine/src/tests/solsticeInterruption.test.ts; engine/src/tests/undoPolicy.test.ts; app/src/localGameSave.test.ts; this plan; docs/rules-engine-parity-matrix.md
Rule/source decisions and test IDs: SRC-11 and SRC-12; T01-T08. Recipients order effects applying to them while source ownership persists; later card effects are re-evaluated against the source owner's current Solstice zones
Commands, working directory, exit codes, test totals: focused timing/undo (exit 0: 25); focused app codec (exit 0: 24); npm.cmd run test -w engine (exit 0: 54 files/1,582); npm.cmd run test -w app (exit 0: 22 files/227); npm.cmd run typecheck (exit 0: engine, app, server)
Failure reproduced before fix and passing evidence after fix: source inspection found that an incomplete persisted sourcePlayerIds map could silently fall back to recipient ownership; phase/cursor/card/source-map validation now parks malformed continuations. The first focused run also corrected two test assumptions about voluntary-draw and shortage-allocation intermediate states
Browser checks, viewport/input mode, public-safe artifact paths: no visual surface changed; boardgame.io client undo behavior exercised in-process; all cards, seats, seeds, and plugin snapshots are synthetic
Compatibility/version decisions: existing serializable continuation fields are validated without changing their shape; no additional state-format bump is required. G1 rulesVersion 3 already covers the changed semantics
Known limitations or unresolved rules: SRC-12 is explicitly documented as a zone-based inference; online persisted-state compatibility and quarantine remain G3; physical controller/browser walkthroughs remain G5
Next concrete action: close G2, then begin G3 by separating save inspection/recovery from playable validation and enforcing the shared compatibility policy online
```

## G3. Recover Saves and Guard Online Compatibility

Objective: one bad save cannot hide healthy saves; incompatible games remain recoverable but cannot mutate under the wrong rules.

Primary files: `app/src/localGameSave.ts`, `app/src/saveLibrary.ts`, `app/src/ui/setup/SavedGames.tsx`, `app/src/ui/online/OnlineGames.tsx`, `engine/src/game/state.ts`, `engine/src/game/initialState.ts`, `engine/src/game/game.ts`, `server/src/boardgameStorage.ts`, `server/src/index.ts`, `server/src/polityLobby.ts`, and related tests, especially `server/src/multiplayerTransport.test.ts`.

Implement local recovery first:

1. Separate structural inspection from playable validation. Use a discriminated result such as playable, legacy-incompatible, future-version, corrupt, or unsupported-format. Classify slots independently while retaining the original stored representation.
2. Show each readable slot's safe name/date/version and compatibility reason. Resume only validated compatible state. Allow deliberate local export of the owner's original recoverable data without routing it through a serializer that stamps current versions.
3. Preserve unknown fields and original raw storage for recovery. When an individual slot has no independent raw text, retain the complete original library bytes and document the difference between raw-library export and reconstructed slot export.
4. If the entire library is malformed, offer raw local backup before a user-confirmed reset. Do not auto-reset, overwrite, drop invalid slots, or replace a failed import with an empty successful library.
5. Keep display rendering escaped and size-bounded. Do not render arbitrary HTML, assume object shapes, or include raw content in crash/support logs. Distinguish owner-directed local backup from public-safe diagnostic export; retain existing privacy checks for the latter.
6. Preserve overwrite protection, revision checks, cross-tab locks, quota/error handling, and legacy-autosave backup. A failed write/migration must leave original recovery data intact. A successful migration is idempotent and tested.

Then enforce online compatibility:

7. Persist canonical engine rules/state versions in authoritative new match state. Validate at load/reconnect and before mutation, not merely in the lobby UI or browser envelope. Derive display status from the same policy.
8. Inspect the installed boardgame.io processing/storage lifecycle before choosing hooks. Cover ordinary moves, events/turn transitions, undo/redo, restored plugins/history, and reconnect. A wrapper around application moves alone may not cover library-managed actions.
9. Cover both configured FlatFile persistence and the default storage path. Keep incompatible persisted records intact; quarantine/refuse mutation with a stable reason. Do not rewrite their version, fabricate gameover, record a completed result, or silently start a replacement match.
10. Keep match ownership/authentication and player-view redaction intact. Recovery for a participant must not return other players' hidden data or credentials. Full raw server backups remain an authorized administrative capability, not a new public endpoint.
11. Use synthetic persisted records to prove server restart and client reconnect behavior. Existing local-only version 2 envelopes do not prove online history compatibility. If online migration cannot be proven, preserve/refuse and explain restart options.

Required matrix:

| ID | Coverage and observable result |
| --- | --- |
| R01 | Current state resumes; unversioned/older/future rules refuse safely; envelope/state disagreement is rejected |
| R02 | Supported older format migrates idempotently with backup; unsupported shape stays recoverable |
| R03 | Malformed JSON, malformed slot, mixed slots, and oversized payload cannot hide healthy slots or crash the view |
| R04 | Quota failure, stale revision, concurrent tabs, and interrupted migration preserve original data |
| R05 | Raw-library backup preserves original bytes; reconstructed slot export is labeled accurately and never relabeled current |
| R06 | Compatible pending choices resume; stale continuations and unsafe undo history are rejected |
| R07 | Incompatible online state rejects moves/events/undo/redo before and after storage restart |
| R08 | Authorized recovery respects ownership; unauthorized requests and participant exports cannot expose hidden state |

Exit: healthy slots remain usable beside incompatible ones; originals export without relabeling; malformed libraries have a non-destructive recovery path; incompatible online matches reject all gameplay mutation across restart; compatible G2 interruptions resume faithfully. No unsafe historical migration is claimed.

Verification: save/app and storage/transport/server tests, `npm.cmd run typecheck`, `npm.cmd run smoke:multiplayer`, and browser recovery walkthrough with synthetic saves.

### G3 Evidence Record

```text
Stage and date: G3 Recovery and online compatibility, 2026-09-06
Base commit and pre-existing worktree changes: ef60fb4; extensive modified/untracked source and deleted ignored PDF/image/log scratch artifacts predated or span the sequential roadmap work and were preserved
Files changed in this stage: app/src/localGameSave.ts and tests; app/src/saveLibrary.ts and tests; app/src/ui/setup/SavedGames.tsx; app/src/onlineSession.ts; app/src/ui/online/OnlineGames.tsx and tests; engine/src/game/version.ts; engine/src/game/state.ts; engine/src/setup/setupPipeline.ts; engine/src/tests/versionCompatibility.test.ts; server/src/boardgameStorage.ts and tests; server/src/lobbyTypes.ts; server/src/polityLobby.ts and tests; server/src/index.ts; ../scripts/local-browser-qa.mjs and tests; this plan and parity matrix
Rule/source decisions and test IDs: R01-R08; rulesVersion 3 and stateVersion 1 are engine-owned; unknown, legacy, future, malformed, and unsupported semantic state is preserved/refused rather than migrated; boardgame.io Master lifecycle inspection identified fetch/setState/setMetadata as the common move/event/undo/redo/reconnect boundary
Commands, working directory, exit codes, test totals: from imperium-like-digital-prototype, focused save/library/App 47 pass; focused online/lobby/storage/transport 57 pass before final lifecycle addition; final storage 10 pass; local-browser-qa script unit 25 pass; app full 233 pass; final server full 85 pass; verify:rules 1,590 engine plus 42 audit pass; typecheck all three workspaces pass; smoke:multiplayer exit 0; qa:local-browser exit 0 after Playwright launch permission
Failure reproduced before fix and passing evidence after fix: a current local envelope could bless an unversioned engine state; mixed libraries could fail as a unit; online stores accepted any historical state. Strict envelope/state agreement, isolated recoverable slots, guarded sync/default and async/FlatFile stores, and direct boardgame.io Master move/event/undo/redo/sync/connection tests now refuse incompatible state without mutation
Browser checks, viewport/input mode, public-safe artifact paths: headless Chromium exercised synthetic save copy/rename/resume, three healthy slots beside two recoverable slots, exact raw download, reconstructed legacy version retention, and confirmed malformed-library backup/reset; desktop, Steam Deck, narrow tablet, iPhone portrait, and iPhone landscape QA passed; disposable artifacts were under ignored tmp/local-browser-qa storage and removed after success
Compatibility/version decisions: authoritative setup stamps rulesVersion 3/stateVersion 1; both default memory and FlatFile storage validate create/load/reconnect and mutation; the lobby exposes only compatible/incompatible/missing status from the same engine classifier; raw online recovery remains an internal administrative function with no public endpoint
Known limitations or unresolved rules: no historical semantic rules migration is claimed. Version-1 library shape normalization and legacy-autosave import are supported only when the contained engine state is already current; incompatible server records require an administrator to retain/export storage and update or restore a compatible deployment
Next concrete action: close G3, then begin G4 by converting fictional scenario labels into typed executable playtests with independent expected traces
```

## G4. Turn Fictional Content Into Executable Playtests

Objective: original decks and full scenarios exercise actual game behavior with independently calculated results.

Primary files: `data/fictional-regression/`, `engine/src/tests/fictionalScenarioSmoke.test.ts`, `engine/src/tests/gameplayStress.test.ts`, `../scripts/fictional-game-smoke.mjs`, and `package.json`.

Suggested additions: a typed runner under `engine/src/tests/helpers/`, scenario fixtures under the existing fictional directory, and a short original-deck/scenario guide next to those fixtures.

Implementation sequence:

1. Audit current scenario IDs and tags against tests that really execute them. Keep planned, smoke-only, and executed semantic coverage distinct. Replace free-text assertion labels with typed supported checks; unknown assertion/step types must fail validation.
2. Create compact original deck sets using the existing importer/setup schema. Give each a distinct tested role: progression, Trade/resource decisions, and reactions/Regions. Use original names/text/art and deterministic synthetic Bot data where needed. No copied official card lists or balance claims.
3. Define scenario ID, fixture version, rules version, seed, setup/options, actor/step sequence, expected pending choices, checkpoints, terminal condition, score arithmetic, and source references for mechanics. Include a readable explanation of independently calculated results.
4. Drive full scenarios from valid setup through production moves and choice resolvers. Do not mutate state mid-run to force expected outcomes. Separately label deliberately constructed boundary-state tests; those are useful but are not full playable games.
5. Add checkpoint assertions for resources, Actions/Exhaust, exact card locations, legal choices, phase/order, and score components. Expected totals must be handwritten/calculated independently, not generated by the scoring function under test.
6. Cover a complete solo game and a complete two-player game to a legitimate terminal condition, with at least one G2 save/resume checkpoint. Add 3-/4-player ordering scenarios using G2 fixtures. Bound turns/actions with a clear stuck-state failure instead of silently accepting timeouts.
7. Make the public fixture path accessible through the existing local game setup flow. Explicitly label it fictional. Do not add a marketing landing page or enable private import by default. Using an existing typed bundle parameter named `privateData` is acceptable for synthetic in-memory data, but no private files may be read.
8. Output a concise scenario report with executed IDs, checkpoint counts, seed, terminal reason, expected/actual score, and failures. Include only public synthetic data. Integrate execution into existing smoke/test gates without counting registration tests as scenario completion.
9. Test the tests: deliberately perturb an expected score, skip a required scenario, and provide an unknown step; each must fail. Revert these intentional test perturbations before final verification.

Minimum scenario set:

| ID | Required behavior |
| --- | --- |
| F01 | Setup through progression into the later game stage; separate Action/Exhaust accounting |
| F02 | Trade with finite resources, alternative legal payments/choices, acquisition destinations |
| F03 | Reaction/Region/garrison sequence with ordered continuation and resume |
| F04 | Human-to-Bot interactions from G1 in a playable solo sequence |
| F05 | Normal endgame with a hand-calculated score breakdown and applicable limits |
| F06 | Immediate Collapse with no trailing effects and the correct terminal outcome |
| F07 | Complete solo and two-player games; not merely serialized midgame snapshots |

Exit: every promised scenario actually runs and fails on a wrong outcome; complete games terminate legally; deck/scenario versions and limitations are explicit. Fixture balance is evaluated only for these original decks, not extrapolated to unavailable official content.

Verification: scenario tests, `npm.cmd run test:stress`, `npm.cmd run smoke:fictional-game`, `npm.cmd run verify:rules`, and one full fictional browser playthrough.

### G4 Evidence Record

```text
Stage and date: G4 Executable fictional playtests, 2026-09-06
Base commit and pre-existing worktree changes: ef60fb4; extensive modified/untracked roadmap work and pre-existing unrelated dirty-worktree artifacts were preserved
Files changed in this stage: data/fictional-regression/cards.json, nations.json, rulesets.json, scenarios.json, and README.md; engine/src/tests/helpers/fictionalScenarioRunner.ts; engine/src/tests/fictionalScenarioSmoke.test.ts; engine/scripts/run-fictional-scenarios.ts; engine/src/game/moves.ts, state.ts, and setup/setupPipeline.ts; engine/src/tests/soloHumanInteractions.test.ts; app/src/publicFictionalFixtures.ts and test; app/src/ui/setup/NewGameSetup.tsx and summary test; ../scripts/fictional-game-smoke.mjs; ../scripts/local-browser-qa.mjs; package.json; this plan
Rule/source decisions and test IDs: F01 progression and Action/Exhaust separation; F02 finite Trade and acquisition; F03 reaction/Region/Garrison restore; F04 playable human-to-Bot theft/draw/Unrest; F05 normal 3-3 scoring; F06 immediate Collapse; F07 restored complete 2P and solo games; F08-3P/F08-4P explicitly constructed Solstice boundaries. Compact original fixtures are correctness probes, not balance claims
Commands, working directory, exit codes, test totals: from imperium-like-digital-prototype, fictional scenario/data 7 pass; test:stress 17 pass; smoke:fictional-game exit 0 with 10 IDs and 17 checkpoints; verify:rules 1,593 engine plus 42 audit pass; app full 235 pass; engine and app typechecks pass; local-browser-qa script unit 25 pass; qa:local-browser exit 0 after Playwright launch permission
Failure reproduced before fix and passing evidence after fix: the old smoke counted planned tags and its npm wrapper ran the whole engine suite without proving scenarios; production playCard also rejected Bot-scoped theft/draw/Unrest before the supported executor could run. The typed runner now rejects unknown steps/checks and missing IDs, score perturbation fails, participant preflight reaches the Bot adapters, and standalone ESM reporting uses import.meta.url
Browser checks, viewport/input mode, public-safe artifact paths: headless Chromium loaded the public synthetic fixture from setup, kept private-import diagnostics empty, selected Last-Straw Assembly for both seats, showed implemented/tested card metadata, clicked the card and Play Card, and reached Winner Player 2 with Collapse scores 1-0 and no five-Materials trailing effect. Existing desktop, Steam Deck, narrow-tablet, iPhone portrait, and iPhone landscape checks remained green; disposable QA storage was removed
Compatibility/version decisions: fixtureVersion 2 declares rulesVersion 3; restore steps pass through the current state/rules compatibility classifier. The browser reuses the typed privateData bundle shape only for committed synthetic in-memory records and does not read private files
Known limitations or unresolved rules: F08 deliberately constructs isolated boundary state and is not counted as a complete game. The fixture decks are compact deterministic correctness probes and do not certify official card coverage, official nation balance, or full-length pacing
Next concrete action: close G4, then begin G5 with a player-view walk-through of F01-F07 and a measured audit of payment, legality, score explanation, focus, keyboard, controller, and large-choice behavior
```

## G5. Explain Play and Polish Input Controls

Objective: players can understand costs, choose legal actions, follow changes, and inspect scores without hidden-information leaks or input-device barriers.

Primary files: `engine/src/game/payments.ts`, `engine/src/game/scoring.ts`, `engine/src/game/playerView.ts`, `app/src/ui/controller/selectionModel.ts`, `keyboardControls.ts`, `gamepadControls.ts`, `selectedCardFeedback.test.ts`, `app/src/ui/layout/GameLogPanel.tsx`, `EndGameSummary.tsx`, and existing board/choice components discovered during implementation.

Implementation sequence:

1. Walk through F01-F07 as a user before editing UI. Record confusing decisions, hidden costs, focus loss, inaccessible actions, and unclear terminal outcomes. Measure existing action-model generation on large synthetic pending choices.
2. Derive pure, typed payment/legality explanations from the same engine rules used to validate actions. Distinguish exact payable costs, optional alternatives, variable costs awaiting input, and unavailable actions. Revalidate on commit; a preview is not a reservation or authorization.
3. Show concise costs, meaningful legal targets, and specific disabled reasons adjacent to the action. Preserve selection when valid and clear stale selection when game state changes. Display gameplay information, not instructional paragraphs about how the app works.
4. Add resource deltas and ordered effect feedback from structured public-safe events or a small extension to existing event types. Avoid parsing human log strings into game logic. Coalesce noisy announcements without losing payment/terminal events.
5. Separate pure score contribution calculation from any scoring/finalization mutations. Reuse canonical contributions in final scoring and presentation where practical; assert totals against independent F05 arithmetic. Display category subtotals, caps/penalties, total, and terminal reason. Treat hidden midgame information as unavailable, not a leaked exact preview.
6. Replace eager permutation enumeration with an incremental reorder interaction and validated submit payload. Cover Solstice, look ordering, and other affected callers. Preserve access to every legal order; do not truncate the list or substitute a single automatic ordering.
7. Support keyboard/controller move-up/down, selection, confirm/cancel, and predictable focus return. Prefer familiar icon controls with accessible names/tooltips. Keep controller repeat/debounce behavior and touch interactions consistent with existing patterns.
8. Test at 360x800 and 390x844 mobile, 1280x800 and 1920x1080 desktop, plus enlarged text/200% zoom. Check no clipped costs, overlapping dialogs, horizontal board-control loss, or offscreen primary actions. Target touch controls at least 44 CSS pixels where feasible and document unavoidable compact exceptions.
9. Check visible focus, logical traversal, modal focus containment/return, no keyboard trap, live announcements, and color-independent legal/disabled states. Use existing automated accessibility tooling if available; supplement with manual checks and state their limitations.
10. Test synthetic 8- and 12-item reorder choices with bounded item/action generation and no factorial allocation. Use stable operation-count assertions, plus measured browser timings; do not use a flaky absolute wall-clock unit-test threshold. Verify stale online updates during confirmation are handled correctly.

Required acceptance cases:

| ID | Observable result |
| --- | --- |
| U01 | Displayed cost agrees with charged resources for valid fixed and alternative payments; stale preview is rejected safely |
| U02 | Legal targets match engine acceptance; invalid targets give a reason without leaking hidden state |
| U03 | Resource/event feedback preserves actual ordering across reaction, resume, and Collapse |
| U04 | Endgame contributions sum to authoritative totals; rendering/reopening does not mutate or rescore |
| U05 | Every tested order can be composed without factorial action lists; controller and keyboard can complete/cancel |
| U06 | Focus survives selection, modal close, save recovery, and online updates; mobile and zoom layouts remain usable |
| U07 | Opponent/spectator views and support diagnostics reveal no hidden cards, deck order, or credentials |

Exit: complete F01-F07 decisions are understandable through the real UI; tested keyboard/controller paths work; no preview/final-score mutation or hidden-data leak; large order choices remain responsive.

Verification: focused engine/selection/controller/component tests, `npm.cmd run typecheck`, `npm.cmd run qa:local-browser`, and browser screenshots/walkthrough evidence. Simulated gamepad tests do not prove physical-device behavior; record physical testing as unperformed when hardware is unavailable.

### G5 Player-View Audit

| Flow | Before implementation | Verified result |
| --- | --- | --- |
| F01 progression and payment | Play choices printed generic costs and did not consistently explain why a card was unaffordable | The action model uses the canonical pure payment resolver, displays the exact fixed or alternative payment, disables unavailable actions with a current reason, and revalidates at commit |
| F02 Trade and acquisition | Prose logs obscured which seat lost or gained each resource | Typed public resource events expose ordered payment, gain, removal, return, steal, and Trade deltas without parsing display strings |
| F03 reaction, Region, Garrison, and restore | Required tasks existed, but technical log strings made resumed effect order hard to follow | Ordered structured events feed the visible live-status region; existing interruption/recovery tests and browser paths retain the active decision and reject stale selection |
| F04 human-to-Bot interaction | Hidden recipient cards and ordering identities required an explicit wrong-view check | The ordering panel is owner-only, opponent/spectator score details are redacted, and player-view/component tests prove hidden identities are absent |
| F05 normal scoring | The summary exposed totals and tie breaks without an auditable additive explanation | Pure canonical breakdowns show category subtotals, variable caps, conditional points, penalties, Progress, total, and tie-break contributions; rendering is read-only |
| F06 Collapse | The terminal message was a technical free-form string | A typed terminal event announces Collapse, winner, and authoritative scores; the fictional browser scenario still proves that no trailing effect resolves after immediate Collapse |
| F07 complete, save, and resume | Focus and a selected action could become stale after state replacement | State reconciliation clears unavailable selection, modal/order controls return focus predictably, and save/recovery/browser coverage remains green |

Large-choice measurement: the former eager action model exposed `n!` complete permutations (40,320 at 8 items and 479,001,600 at 12). The incremental composer now creates `2n + 2` operations for ordinary ordering (18 and 26) and `3n + 2` for look-and-take ordering (26 and 38), while adjacent moves preserve reachability of every permutation. Browser QA exercised a real 12-card engine submission with 12 rows and 24 move controls.

Accessibility and device review: visible focus, modal containment/return, Escape cancellation, keyboard confirmation, F6 action focus, controller command mapping/debounce, 44px ordering controls, and color-independent disabled reasons have automated coverage. Eight browser profiles pass: 360x800, 390x844, 844x390, 760x900, 1280x800, 1440x900, 1920x1080, and 1920x1080 at 200% root text. No automated accessibility scanner was installed, so semantic/focus/browser assertions supplement inspection. Physical controller hardware testing remains unperformed; controller evidence is simulated only.

### G5 Evidence Record

```text
Goal: G5 Explain Play and Polish Input Controls
Implemented/tested matrix IDs: U01-U07; player flows F01-F07
Production files changed: engine/src/game/payments.ts, engine/src/game/scoring.ts, engine/src/game/state.ts, engine/src/game/playerView.ts, engine/src/cards/effectRunner.ts, engine/src/index.ts, app/src/ui/controller/selectionModel.ts, app/src/ui/controller/orderComposer.ts, app/src/ui/controller/keyboardControls.ts, app/src/ui/controller/gamepadControls.ts, app/src/ui/layout/ActionMenu.tsx, app/src/ui/layout/GameLogPanel.tsx, app/src/ui/layout/EndGameSummary.tsx, app/src/ui/layout/OrderChoicePanel.tsx, app/src/ui/layout/BoardLayout.tsx, app/src/ui/styles/board.css, types/vendor-shims.d.ts, scripts/local-browser-qa.mjs
Tests/fixtures added or changed: engine/src/tests/playExplanation.test.ts, engine/src/tests/playerView.test.ts, engine/src/tests/uiSelectionModel.test.ts, app/src/ui/controller/orderComposer.test.tsx, app/src/ui/controller/playFeedback.test.tsx, app/src/ui/controller/keyboardControls.test.ts, app/src/ui/controller/gamepadControls.test.ts, app/src/ui/layout/BoardLayout.test.tsx, app/src/ui/layout/EndGameSummary.test.tsx, scripts/local-browser-qa.test.mjs
Commands and exact outcomes: focused engine/UI/controller/component tests 186 passed; app suite 243 passed; engine suite 1,599 passed; QA-script suite 37 passed; typechecks passed; fictional smoke passed 10 matrix IDs and 17 checkpoints; local browser QA passed all eight viewport profiles, F06 Collapse, recovery/multiplayer paths, and the 12-item order-composer submission; git diff --check reported no whitespace errors
Failure reproduced before fix and passing evidence after fix: unaffordable actions lacked canonical reasons, terminal/resource feedback relied on prose, score totals lacked contributions, and ordering generated factorial action lists. Browser assertion development also exposed stale coupling to the old terminal string, a fixture with only ten default cards, and a deck/source mismatch; the final synthetic fixture and real-engine submission pass
Browser checks, viewport/input mode, public-safe artifact paths: headless Chromium covered desktop, Steam Deck, tablet, phone portrait/landscape, and 200% text; keyboard ordering move/reset and validated submission passed; all fixture cards and save mutations are synthetic and in memory
Compatibility/version decisions: score breakdowns are optional top-level terminal state instead of changing the compact gameover contract; structured events are optional log metadata with legacy display fallback; no rulesVersion or persisted-state format bump is required
Known limitations or unresolved rules: physical gamepad behavior is not proven; no automated axe-style scan was available; official card-by-card coverage, balance, and pacing remain outside this public-safe plan
Next concrete action: run verify:improvements and verify:production-local separately, inspect the complete outputs and private-data boundary, then close the final integration review
```

## 5. Commands and Final Integration Gate

All npm commands below run from the npm workspace stated in Section 2. Inspect scripts before execution because they may have changed. Run commands separately and preserve their exit codes; never call a partial or timed-out aggregate green.

For targeted engine tests, use the installed Vitest entry point after confirming its location, for example:

```powershell
node .\node_modules\vitest\vitest.mjs run --root engine src/tests/soloHumanInteractions.test.ts
```

That example becomes valid only after the proposed test exists. Use the actual existing filename when extending a test. Do not invoke a downloader to conceal a missing dependency. Use the ordinary workspace test scripts for full suites.

After the last implementation edit, run:

```powershell
npm.cmd run verify:improvements
npm.cmd run verify:production-local
```

The inspected `verify:improvements` runs release-script tests, the full pre-private gate, and asset checks. The pre-private gate includes engine tests plus the independent rules audit, QA-script tests, typechecking, app/server tests, private status, fictional/multiplayer smoke, and local browser QA. `verify:production-local` adds build/server verification and the local operations rehearsal. Record any future script changes and retain these behaviors.

Before these aggregates, verify G1-G5's new focused tests and scenario runner are discovered by the relevant scripts. Update script-contract tests when intentionally changing scripts. A green unchanged gate that never executes new coverage is insufficient.

Final user-perspective audit:

1. Start a fictional game, inspect and pay costs, resolve a reaction/ordering choice, save mid-interruption, reload, continue, and finish with a verified score or Collapse.
2. Recover/export an incompatible synthetic slot beside a healthy one; confirm the healthy slot still resumes and the incompatible slot does not.
3. Restart the disposable local multiplayer server with compatible and incompatible persisted matches; exercise reconnect and attempted moves/events/undo/redo as authorized and unauthorized clients.
4. Repeat key decisions with keyboard, simulated controller, and mobile touch viewport. Check participant and spectator redaction.
5. Review changes for unrelated churn, committed private content, unchecked migrations, and altered test expectations lacking independent justification. Run `git diff --check`; inspect untracked files explicitly because ordinary diff omits them.
6. Update parity/closure documentation with precise coverage, evidence, and remaining limitations. Complete the progress ledger only for verified work.

Keep required servers available for the user when appropriate, report their actual local URLs, and clean up disposable accounts/matches through the existing local rehearsal workflow. Do not confuse local proof with live deployed proof.

If a release is separately authorized later, follow `docs/release-automation.md`, inspect the exact intended commit, preserve unrelated changes, and verify the hosted commit identity plus hosted smoke/browser tests. This plan does not authorize that release.

### Final Integration Evidence

```text
Scope: G0-G5 public-safe roadmap and final integration review
Base revision inspected: ef60fb49430e000fb5288d8c5b8e33150a8fbae8
Aggregate gate: npm.cmd run verify:improvements completed with exit code 0 in one uninterrupted post-fix run
Rules and tests in aggregate: 1,599 engine tests, 42 independent rules-audit tests, 37 local QA-script tests, 243 app tests, 85 server tests, and 16 release-script tests passed; engine/app/server typechecks passed
Synthetic play evidence: fictional smoke passed 10 matrix IDs and 17 checkpoints at rulesVersion 3; F05 ended 3-3 by normal scoring; F06 ended 1-0 by immediate Collapse; multiplayer smoke passed two occupied seats, restart listing, and credential heartbeat
Browser evidence: all eight responsive/text profiles passed; save/invalid-save/recovery-library, practice/solo/multiplayer worked turns, privacy markers, custom Commons, F06 terminal result, and the 12-item order composer passed
Asset evidence: the first aggregate correctly failed because initial JavaScript was 982,548 bytes against 980,000. EndGameSummary was moved to a terminal-only lazy chunk; the uninterrupted rerun passed at 973,034 initial bytes and 245,923 gzip against limits of 980,000 and 250,000
Production-local gate: npm.cmd run verify:production-local completed with exit code 0; all typechecks, 85 server tests, the production build, and eight public-safe operations-rehearsal checks passed
Repository audit: git diff --check returned no whitespace errors (line-ending warnings only); changed and untracked paths were inspected; no added or modified private-card-data, generated-private, PDF, PNG, or JPEG path was found; no QA listener remained on ports 8780, 8786, or 8791
Private status: intentionally blocked with 0/6 header-only private sources ready. No private rows were entered, read into the implementation, or committed; every new gameplay fixture is synthetic
Pre-existing worktree state: unrelated deleted temporary PDF/image/render/log artifacts remain untouched, along with the broader accumulated roadmap changes
Manual limitations: physical gamepad testing, a dedicated automated accessibility scanner, live hosted proof, commit creation, and deployment were not performed. Local proof does not certify official card-by-card coverage, balance, or pacing
Release decision: no commit or deployment was authorized by this plan
```

## 6. Completion and Handoff Rules

- A stage is complete only when its implementation, scoped regression tests, required verification, compatibility decision, and evidence record are finished.
- Do not check boxes for intended work, syntax-only validation, taxonomy membership, unsupported logs, or aggregate commands whose final output was not captured.
- If public rules are ambiguous, record the precise question and source evidence. Do not remove the assertion, loosen the expected result, or label the feature faithful. Continue independent work, but leave that stage's exit unmet.
- If time/context ends, leave a concrete handoff: current files, last full command outcome, any running process identifiers, next test/action, and unresolved risk. Do not restart from scratch or declare success to end a turn.
- Final report must distinguish implemented, tested locally, manually inspected, not tested, source-unresolved, and not deployed. No official-content certification without the corresponding authorized data and independent audit.

Suggested instruction for the user to start execution in Sol 5.6:

> Read `docs/superpowers/plans/2026-09-06-public-game-improvement-plan.md`. Pursue its stages as goals in order, beginning with G0. Follow the public-data boundary, update the file's evidence ledger after each stage, and do not mark a stage complete without its exit criteria. Preserve existing changes. Do not commit, push, or deploy.
