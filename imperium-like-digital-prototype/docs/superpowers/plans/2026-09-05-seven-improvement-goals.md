# Seven Improvement Goals: Audited Implementation Plan

Status: audited before implementation. Execution order is 1 through 7.
Baseline: ee82520. Production origin correction is a Render configuration change.
Scope: fictional/public fixtures; preserve unrelated worktree changes and private CSVs.

## Audit Evidence

- `engine/src/tests/gameplayStress.test.ts`: five fixed 96-step configurations and one fictional final-scoring scenario. The driver selects the first eligible action, checks nonnegative resources and known card references, but does not compare replay or save/restore continuations. Choice branches and scenario assertions need targeted coverage, not just more seeds.
- `app/src/localGameSave.ts`: version-1 envelope, metadata normalization, private-field guards, fingerprint validation, import/export, and an unused array slot upsert helper. Persistence uses one localStorage key. `App.tsx` owns autosave and recovery UI.
- `engine/src/game/game.ts`: boardgame.io adapter, player-view redaction, wrapped engine moves, no explicit undo policy. Audit framework history semantics before introducing undo rules.
- `app/src/App.tsx`: eager imports of Board, About, transcription, lobby, and setup. Existing production build previously reported a roughly 1 MB JavaScript chunk; measure again before setting budgets.
- `app/src/ui/controller/keyboardControls.ts`: Tab prevents native focus traversal and cycles panels; letter shortcuts do not guard modifier keys, repeat, or contenteditable. Address these before adding controller navigation.
- `app/src/ui/setup/NewGameSetup.tsx`: custom card IDs and search/selection already exist; no persisted preset library. Saved setup reconstruction preserves custom IDs.
- `scripts/render-sync.mjs`: deploy-hook helper only; current production release required an explicit authenticated API deployment. Existing smoke accepts an expected commit, and hosted browser QA covers functional flows.

## 1. Engine Reliability

Status: complete. Engine typecheck and all 51 engine files / 1535 tests pass. Focused stress/scenario suite: 17 tests pass, including 20 seeds per mode at 192 maximum steps, repeated replay and JSON checkpoints. Reactive pending-effect restoration is covered in turnLoop. Card IDs are definition references, so uniqueness is deliberately not asserted.

Reproduce routine coverage with `npm.cmd run test:stress`. For deeper coverage set `POLITY_STRESS_SEEDS=20` and `POLITY_STRESS_STEPS=192`. Set `POLITY_STRESS_SEED` to the failure record's seedPrefix and use its seedCount to reproduce a failing iteration. Failures emit JSON containing mode, seed, steps, options and assertion details; Vitest output can be retained as the report. Move randomness is derived from seed and action index using the existing setup RNG, so checkpoints need no hidden test-runner RNG state.

1. Extend the existing stress driver with configurable seed and step limits, deterministic failure records, and a documented reproduction command.
2. Check finite nonnegative resources/tokens, valid player/choice references, and known zone cards after each action. Do not assert card-ID uniqueness where the data model represents multiple copies with one definition ID.
3. Compare repeated seeded executions and JSON save/restore continuations, including action traces and final state. Record only fictional scenario inputs, never private runtime states.
4. Add targeted chained-choice, reaction-timing, scoring, and combined-variant scenarios using existing fixtures/test builders. Include negative controls proving invariant failures are detected.
5. Separate bounded routine coverage from configurable deeper runs. Retain existing engine regression tests.

Acceptance: one-command reproduction; deterministic replay and restore parity; explicit interaction assertions; invariant negative controls; engine tests and typecheck pass.

## 2. Saved-Game Management

Status: complete. Named library supports save/copy, rename, duplicate, resume, export/import, confirmed replacement/deletion, retained legacy recovery and version checks. App tests: 199 pass; app typecheck/build pass; expanded local browser QA passes. Web Locks serialize supported browsers; revision checks protect stale edits, but localStorage alone cannot guarantee atomic cross-tab edits in browsers without Web Locks. Autosave remains separate. Library schema v1 normalizes to v2; current game-state schema is 1, with unknown future versions rejected rather than guessed.

1. Introduce a versioned library with stable slot IDs, separate manual saves and autosave, and explicit envelope/state migration dispatch.
2. Convert legacy autosaves only after validation and a successful library write; retain the legacy record as recovery evidence.
3. Add named save, rename, duplicate, resume, export, import, and confirmed replacement/deletion controls with mode/round/time metadata.
4. Validate every persisted envelope using existing privacy/fingerprint checks. Reject unsupported future versions and malformed state without replacing a valid save.
5. Handle quota/security failures and stale multi-tab edits. Use storage-event refresh and revision checks; document any platform limits on atomic multi-tab writes.
6. Test migration fixtures, corrupt slots, failed writes, stale revisions, independent slot resumes, and browser import/export/recovery.

Acceptance: legacy saves survive; manual saves are isolated from autosave; failed operations preserve recoverable data; named slots round-trip; unit and browser checks pass.

## 3. Undo and Legal Actions

Status: complete. Engine adapters enforce undo boundaries; invalid engine moves return boardgame.io INVALID_MOVE without retaining log/state mutations. Public resource gain undo, hidden draw rejection, online rejection and invalid active-player actions pass client integration tests. Existing authorization and player-view tests pass. App tests and workspace typechecks pass; server transport tests pass. UI now requires two history entries and uses the engine's last-move result. Pending-resolution actions are conservatively irreversible; expanding that set requires additional information-safety evidence.

1. Audit boardgame.io undo storage, engine move return conventions, current UI undo controls, and player-view history redaction.
2. Establish explicit boundaries for hidden draws/reveals/shuffles, reactions, player/turn changes, and online actions. Use existing framework controls rather than a second state-history engine.
3. Permit reversal only where information and authority are preserved; explain unavailable reversal through existing action-feedback patterns.
4. Audit representative selector/engine disagreements and consolidate shared predicates where this removes an actual divergence.
5. Test allowed reversal, forbidden reversal, nested choices, stale and unauthorized actions, and player-visible history privacy.

Acceptance: supported undo restores correct state; hidden information remains protected; rejected actions cannot affect authoritative state; selector/engine agreement tests pass.

## 4. Site Performance

Status: complete. Entry JS decreased from 1,026.33 kB / 257.18 kB gzip to 937.51 kB / 238.61 kB gzip including all seven additions. Asset budgets: 980 kB raw / 250 kB gzip. Browser delayed-import, failure/reload recovery and full gameplay QA pass. Local timing sample: desktop setup 174 ms / setup-to-board 72 ms; 390x844 viewport with 4x CPU throttle setup 592 ms / setup-to-board 307 ms. The repeatable `npm run perf:board` profile adds 210 fictional cards: desktop resume 107 ms and five interaction samples 66-73 ms; mobile at 4x CPU throttle resume 375 ms and interactions 100-119 ms. Reports/screenshots are under `tmp/large-board-profile` in the prototype. Timings are reports, not cross-machine guarantees. No render memoization was introduced without a demonstrated bottleneck.

1. Measure production assets and initial/setup-to-board load under fixed desktop and constrained profiles; record commands and conditions.
2. Lazy-load optional heavy views based on the measured import graph; provide stable loading and retry/error states.
3. Profile a large fictional board and optimize only demonstrated render costs.
4. Add measurable asset budgets and repeatable browser timing reports; use generous timing thresholds where machine variance prevents reliable hard gates.
5. Verify cold/warm navigation, delayed/failed chunk loads, and gameplay continuity.

Acceptance: recorded before/after evidence; budget check passes; loading/error states work; functional browser checks pass.

## 5. Accessibility and Controller

Status: complete for automated verification. App suite: 207 tests pass; app typecheck/build and full browser QA pass. Browser checks prove native Tab traversal, dialog trapping and focus restoration at desktop/mobile sizes. Standard controller mappings, dead zone, disconnect reset and bounded navigation repeat are implemented/tested. Physical Steam Deck/controller and screen-reader testing remain unverified; do not describe synthetic tests as device certification.

1. Preserve native Tab order; guard shortcuts for editable content, modifiers, repeated input, and modal ownership.
2. Audit dialogs and add focus trapping/restoration, accessible labels, visible focus, status announcements, and Escape handling consistent with existing controls.
3. Add standard-gamepad navigation/confirm/cancel with repeat limits, dead zones, disconnect cleanup, and keyboard/mouse coexistence.
4. Check touch targets, long labels, zoom/reflow, supported viewport layouts, and all main keyboard workflows.
5. Use synthetic gamepad tests and browser tests; record physical device testing as unverified unless hardware is available.

Acceptance: core flows are keyboard usable; no trapped or lost focus; controller inputs have bounded repeat; responsive tests pass; hardware limitations stated accurately.

## 6. Custom Commons Presets

Status: complete. Versioned preset create/load/rename/duplicate/delete/replace and portable import/export are implemented. Seven preset tests pass, app typecheck/build pass, and full browser QA proves save/load and empty-composition launch blocking. UI eligibility uses engine mode/expansion/player-count selection rules; unavailable IDs remain in the preset until deliberately repaired. Library edits detect stale snapshots; automatic multi-tab merge is not implemented.

1. Store versioned local presets with names, IDs, selected card IDs, and compatibility metadata. Preserve original selections on dataset changes.
2. Add create/load/rename/duplicate/delete and import/export with existing privacy guards and explicit overwrite protection.
3. Show selection/group totals and missing/incompatible cards, with deliberate repair actions before launch.
4. Integrate with saved setup configuration without embedding private card text in presets or reports.
5. Test dataset switches, invalid files, incompatible versions, removed cards, storage failures, and browser workflows.

Acceptance: exact selection round-trip; invalid composition blocks launch or requires explicit repair; saved games preserve choices; fictional browser checks pass.

## 7. Release Automation

Status: complete for implementation and non-publishing verification. All 12 fake-API release tests pass, including drift, stale commits, terminal failure, timeout, reuse, and uncertain submission recovery. A live read-only dry run passed remote commit, service identity and configuration checks for the existing deployed SHA ee825202037e744a186454d94872d0626c039d09. The aggregate verification gate passes. These new changes have not been committed or deployed; the real deployment path is covered by fake-API tests, not a new production release.

1. Add a release command requiring explicit service and commit, verifying remote commit existence and service repository/branch/origin identity.
2. Read configuration and disk expectations; report drift without silently mutating production settings.
3. Deploy the exact SHA via Render API, reuse matching active deployments, track the returned ID, and bound polling/timeouts. Do not blindly retry an uncertain POST.
4. Run strict hosted smoke, origin checks, and hosted browser QA only after the expected deployment is live.
5. Write a redacted report with deployment ID, SHA, check results, and remaining manual backup/admin tasks. Never include API keys, hook URLs, account credentials, or private state.
6. Test fake API responses for success, failure, stale commits, drift, timeout, ambiguous submission, and retry behavior. Document recovery and state-schema rollback limits.

Acceptance: deterministic dry-run/test coverage; one command performs explicit deployment and proof; failures stop subsequent checks; report is redacted. Live deployment requires an eligible committed release and the existing authorization context.

## Verification and Closeout

Update each status with concrete evidence as work completes. Use focused tests while implementing, then the existing pre-private gate for shared behavior changes. Keep deployment proof distinct from local verification. Do not mark all goals complete while manual or implementation acceptance items remain outstanding. Start a local preview after frontend implementation and provide its URL.

### Final Evidence

- `npm run verify:improvements` passed: 12 release tests, 37 QA-script tests, 214 app tests, 76 server tests, and 1,539 engine tests, plus workspace typechecks, fictional gameplay, multiplayer restart/heartbeat, browser workflows and asset budgets.
- A deeper seeded run passed with 20 seeds per mode and 192 steps. Browser coverage includes save-slot recovery/duplication, Commons preset loading and invalid-launch blocking, deferred-view recovery, and desktop/mobile dialog focus.
- Production build and the large-board profile passed after the final UI changes. Saved-game mobile contrast was inspected and corrected.
- Local preview: http://127.0.0.1:8795. New changes remain local; no new commit or deployment was performed. Pre-existing deleted temporary artifacts were left untouched.
- Remaining manual verification: physical controller/Steam Deck behavior and screen-reader testing. Browser storage without Web Locks has a documented cross-tab atomicity limitation. Future game-state schema migrations require concrete fixtures when those schemas exist.
