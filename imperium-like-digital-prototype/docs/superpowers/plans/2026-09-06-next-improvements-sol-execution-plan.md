# Next Improvements: Sol Execution Plan

Date: 2026-09-06
Status: IN PROGRESS. S0 through P8 implemented and locally verified; P9 release proof in progress. Physical controller, touch-screen, and screen-reader observations remain explicitly unperformed.
Audience: Sol continuing the project without the preceding conversation.

## 1. Objective and Scope

First complete S0, a bounded official-source gathering and local playtest stage. Then complete the nine requested improvements: Commons composition validation, base-set availability, simpler basic setup, whole-setup presets, an original guided game, property-based engine assurance, accessibility verification, further code splitting, and a commit-pinned hosted release.

The product priority is a simple path from setup to a playable game. Keep Classics, Legends, and Horizons immediately accessible. Advanced Commons means composing a mixed card pool; Advanced Setup means revealing optional session settings. These are distinct concepts and must remain understandable.

This turn authorizes writing this plan file only. At execution time, follow the user's latest scope and existing session authorization. Do not treat this file as independent permission to publish. A later instruction to execute the whole plan including commit/deployment provides that scope; do not ask again unnecessarily. Otherwise prepare the exact release candidate and request any missing publication authorization only when the candidate is reviewable. Create goal-tool entries only if the user explicitly requests goals; then use one stage at a time, no invented token budget, and the goal tool's actual completion/blocking rules.

Success is observable behavior through real local and online entry points, supported by reproducible tests. Public fixtures, CI, demonstrations, and hosted proof remain original and synthetic. S0 may collect publisher-provided references and derive a small, isolated local-only test pack when this plan is executed; it does not authorize publishing official content. Keep source PDFs, official card text/artwork, derived official-data rows, and private screenshots out of commits, public reports, and hosted bundles. Never collect account credentials or personal data. Do not claim official deck completeness or card-by-card fidelity without independent evidence.

## 2. Workspace and Verified Starting Point

- Repository: `C:\Repos\polity-engine`.
- Npm workspace: `C:\Repos\polity-engine\imperium-like-digital-prototype`.
- Run commands using PowerShell and `npm.cmd` from that workspace unless explicitly stated otherwise.
- Paths below are relative to the npm workspace. Root scripts use `../scripts/`.
- Inspected HEAD: `ef60fb49430e000fb5288d8c5b8e33150a8fbae8`. The working tree contains extensive accumulated implementation changes, untracked audit/test files, and pre-existing deleted scratch images/logs. Preserve unrelated work and inspect untracked files as well as ordinary diffs.
- Read applicable repository instructions first. Use the existing React, TypeScript, Vitest, boardgame.io, storage, and browser QA patterns.

Current source observations, refreshed when this plan was written:

| Surface | Existing behavior | Work still required |
| --- | --- | --- |
| Commons quick choices | `NewGameSetup.tsx` has Classics, Legends, Horizons, and Advanced buttons | Availability and composition feedback are missing |
| Advanced Commons | Cross-set explicit selection, search, source filter, Select Shown, Clear Shown, and Saved pools disclosure | Validate playable composition; keep blocking issues visible outside collapsed preset management |
| Engine selection | Explicit custom IDs can span sets; omitted IDs retain legacy custom-only selection; Horizons Trade alternates use source-set identity | Retain these contracts and test mixed-pool edge cases |
| Current UI gate | `commonsComposition` checks nonempty IDs, missing IDs, and duplicates against eligible picker cards | It does not validate deck construction, market/supply sufficiency, or standard-set availability |
| Replacement behavior | UI picker filters nation conflicts; engine setup can replace cards and reports omissions | Share authoritative final-pool analysis instead of counting the pre-replacement picker list |
| Setup result | `buildCommonsSetup` reports errors and removals; `setupPipeline.ts` stores its report | Audit which errors actually reject game creation at every entry point |
| Data sources | Public placeholder loader and original fictional bundle coexist with optional locally confirmed imports | Count the exact source used at launch and avoid treating placeholder cards as a complete official box |
| Persistence | Current rules version is 3 and game-state version is 1 in `engine/src/game/version.ts` | New setup/tutorial schemas need explicit version policy without automatically invalidating ongoing games |
| Loading | About, online screens, transcription, and endgame summary already have deferred loading | Measure the remaining import graph before choosing another split |
| Asset limits | `check-asset-budget.mjs` sums static entry dependencies; limits are 980,000 raw and 250,000 gzip bytes | Preserve limits and reduce measured startup work |
| Operations rehearsal | `production-playtest-rehearsal.mjs` checks that required docs/scripts exist | A ready report does not mean cleanup, backup, recovery, or hosted QA ran |

Historical results from the preceding implementation: 1,600 engine tests, 42 independent rules-audit cases, 244 app tests, 37 QA-script tests, all typechecks, eight browser profiles, and 974,598 initial / 246,409 gzip bytes passed. These are context, not a fresh test run for this plan. Do not reuse those totals as execution evidence.

Read the previous plan's dated evidence and closure sections: `docs/superpowers/plans/2026-09-06-public-game-improvement-plan.md`. Its starting-point table is historical and describes gaps subsequently fixed. Also read `docs/rules-engine-notes.md`, `docs/rules-engine-parity-matrix.md`, `docs/release-automation.md`, and the existing save/recovery contracts.

## 3. Sequence and Evidence Ledger

Execute S0, then P0, then P1 through P9 in order. S0 inventories available actual content; complete decks are not a prerequisite for the synthetic roadmap. Record unavailable sources and unresolved coverage, and continue unaffected work rather than expanding into an indefinite search. P1 and P2 form the first usable increment. Define the data and UI boundaries needed for P8 while implementing P3-P5, but measure the final splitting work after those features exist. Add focused invariant checks as each engine change is made; P6 broadens them into generated stateful coverage.

| Stage | Dependency | Status | Evidence / next action |
| --- | --- | --- | --- |
| S0 Official sources and local test pack | None | Verified | Nine publisher PDFs verified; 8/8 local source-backed cases passed; two encoding gaps recorded |
| P0 Baseline and contracts | S0 inventory and limitations recorded | Verified | Baseline green; engine setup chosen as the shared authoritative validation boundary |
| P1 Commons validation | P0 | Verified | Shared analysis, launch/server rejection, UI repair path, and focused browser proof pass |
| P2 Base-set availability | P1 | Verified | Exact-data statuses, disabled reasons, demo path, and Advanced round trip pass |
| P3 Basic and Advanced Setup | P1-P2 | Verified | Five-field default, state-preserving disclosure, responsive browser proof pass |
| P4 Whole-setup presets | P1-P3 | Verified | Strict schema, atomic apply, full management, concurrency, and browser proof pass |
| P5 Fictional guided game | P1-P4 | Verified | Six real-engine chapters, dedicated versioned save, scenario and browser proof pass |
| P6 Property-based assurance | P1-P5 | Verified | Bounded and extended seeded properties pass with replay controls |
| P7 Accessibility | P3-P6 | Automated verified; physical checks open | Scoped axe scan and simulated input checks pass; no physical controller/touch/screen-reader hardware was available |
| P8 Code splitting | P3-P7 | Verified | Initial JS reduced 18.4% to 755,322 raw / 195,307 gzip; deferred browser proof passes |
| P9 Release proof | P1-P8 local gates | In Progress | Review exact candidate, run aggregates and operations exercise, then publish/deploy/prove identity |

### S0 Evidence Record - 2026-09-06

Stage / date / status: S0 / 2026-09-06 / Verified

Starting revision and relevant pre-existing edits: Starting revision remains the previously inspected `ef60fb49430e000fb5288d8c5b8e33150a8fbae8`. The working tree already contained extensive runtime, test, documentation, and scratch changes. S0 preserved them. The only tracked S0 change is the containment rule in `.gitignore`; all source and derived pack files are ignored.

Files changed: tracked `.gitignore`; ignored `reference/official-playtest/` source manifest and nine publisher PDFs; ignored `generated-private/official-playtest/` coverage matrix, visual renders, two partial CSV packs, and local test file.

Behavior implemented and acceptance IDs exercised: S01-S05 passed. Nine downloads from the current Osprey resource index have publisher URLs, sizes, page counts, SHA-256 values, and valid PDF signatures. Six import roles have explicit coverage/limitations. Symbol-heavy Bot, corrected-card, and Trade Route pages were rendered and visually inspected. Four Bot rows and two Trade Route rows pass the real validators. Eight independently expected local engine cases pass. Local pack paths are ignored/untracked and have no static app/engine/server/tool/package import. S06 handed the matrix, gaps, and local paths to P0 in this record.

Rule sources, version decisions, and independently derived expectations: Classics/Legends main and solo update 1.0 plus errata 1.2; April 2024 Horizons rulebook and corrected large/small cards. Errata/corrected cards take precedence. Engine rules version remains 3. No revision constants were changed. Expected zone/resource outcomes were derived from the rendered source rows before execution.

Commands / working directory / exit codes / totals: from the npm workspace, both `bot-tables:validate` and `bot-trade:validate` exited 0 with 4/4 and 2/2 valid rows; explicit Vitest with `engine/vitest.config.ts` exited 0 with 8/8 tests. An initial Vitest invocation used the repository-root config and failed before collection; the corrected explicit-config command passed. Hash/signature verification exited 0 for 9/9 files. `private:status` exited 0 and correctly reported blocked, 0/6 ready, all six ordinary files header-only.

Browser journey / viewport / input method / original fixture / artifact paths: no application browser journey was needed for S0. Poppler renders at 120-150 DPI were visually inspected. Local manifests and detailed artifacts are under `reference/official-playtest/` and `generated-private/official-playtest/`.

Reproduced failures and fixes: the first local case run had three pack-integration failures: route rows were addressed as a map instead of an array, and one market fixture triggered immediate Collapse before destination movement. The local test was corrected without changing engine behavior; the identical eight expectations then passed.

Remaining limitations or external dependencies: no verified openly licensed complete machine-readable three-box dataset was found. Corrected-card documents are partial. `S0-GAP-01`: Bot tables need an optional human-draw operation. `S0-GAP-02`: Bot tables need state-conditioned resource theft from the human. Publisher download access does not establish redistribution rights. The source-backed pack remains local-only and cannot certify full official games.

Next concrete action: execute P0 baseline gates and trace all local/online launch paths before designing P1's shared Commons analysis boundary.

### P0 Evidence Record - 2026-09-06

Stage / date / status: P0 / 2026-09-06 / Verified

Starting revision and relevant pre-existing edits: HEAD remains `ef60fb49430e000fb5288d8c5b8e33150a8fbae8`. The extensive pre-existing modified, untracked, and deleted paths were inventoried and preserved. No `AGENTS.md` was present under the repository or npm workspace.

Files changed: this execution-plan evidence record only. P0 made no runtime change.

Behavior implemented and acceptance IDs exercised: baseline and architecture audit complete. Local launch flows from `NewGameSetup` through `App.startLocalGame`, an in-memory boardgame.io client setup wrapper, `PrototypeGame.setup`, and `createInitialGameStateFromPipeline`. Online lobby creation and setup updates store `NewGameSessionConfig`; start finalizes seat/nation data in `pregameLobby.ts` and calls boardgame.io match creation. The legacy direct match route in `polityLobby.ts` also calls boardgame.io creation. Both ultimately rely on `PrototypeGame.setup`. Confirmed imported cards/nations replace placeholder launch data, while the original fictional bundle follows the same explicit `privateData` route. Random solo Bot identity is resolved in the setup pipeline before Commons selection. Nation conflicts and Commons replacements are resolved by `buildCommonsSetup`. The pipeline currently retains reported Commons errors and underfilled-market warnings but still returns a live game; P1 must reject there and preflight both server-facing routes for typed HTTP errors.

Rule sources, version decisions, and independently derived expectations: the current publisher resource index and the locally hashed April 2024 Horizons rulebook were rechecked in S0; symbol-dependent setup pages were rendered there. Public-safe setup contracts are summarized in `docs/rules-engine-notes.md`. Required construction policy for P1 is:

| Configuration | Blocking construction contract | Advisory / post-construction disclosure |
| --- | --- | --- |
| Normal 2-player | Five populated initial Market slots; Region, Uncivilised, and Civilised construction each begins with six face-down cards and then exposes one to the Market, leaving five hidden plus its visible Tributary bottom card; at least six ordinary Fame plus the special bottom Fame card; enough Unrest to attach beneath every eligible initial Market card | Extra Main/Fame/Unrest cards and replacement removals are counts, not completeness claims |
| Normal 3-player | Same, beginning with seven face-down cards per small deck and leaving six hidden plus the visible bottom after the Market seed; seven ordinary Fame | Pacing warnings after required construction |
| Normal 4-player | Same, beginning with eight face-down cards per small deck and leaving seven hidden plus the visible bottom after the Market seed; eight ordinary Fame | Pacing warnings after required construction |
| Solo or practice | Use effective Commons count 2 for Market/small-deck/Tributary checks; Fame uses the actual setup player count contract already used by launch | Identify the resolved Bot/nation replacement dependency; a random unresolved Bot cannot receive a final valid certificate |
| Quick Setup | Five populated Market slots and enough combined Market-eligible cards to leave three small decks at the effective-count target after seeding; three visible Tributary bottoms; ordinary Fame/special Fame/Unrest requirements unchanged | Suit distribution is informational because Quick Setup deliberately combines eligible cards |
| Short Game | Satisfy the underlying construction, then require enough Main cards for the ten-card setup exile without exhausting the Main deck | Report the post-exile Main remainder |
| Practice | Satisfy effective-two-player construction, then require enough Main cards for the fifteen-card practice exile without exhausting the Main deck | Report the post-exile Main remainder and practice clock |
| Trade Routes | Underlying construction plus one additional ordinary Fame; expansion eligibility and Trade alternates must use the same selection/replacement result as launch | Tributary/route group counts and replacement summary |
| Campaign | Validate set-aside Commons references and starting-deck carryover separately; apply ordinary mode/effective-count construction after adjustments | Report campaign removals/additions without treating them as missing source records |
| Registered fictional scenario | A repository-owned scenario ID/version may declare independently tested compact construction requirements | No generic client-provided bypass; ordinary uploaded/custom pools use full launch validation |

The rules/state versions remain 3/1 because P1 changes new-game admission and reporting, not the semantics of started games or save restoration.

Commands / working directory / exit codes / totals: from the npm workspace, `npm.cmd run verify:rules` exited 0 with 56 files, 1,600 engine tests, and 42 rules-audit tests; `npm.cmd run typecheck` exited 0 for engine, app, and server; `npm.cmd run perf:assets` exited 0 at 974,598 initial bytes and 246,409 gzip bytes against 980,000/250,000 ceilings. Vite still reports the existing greater-than-500-KB chunk warning, leaving only 5,402 raw and 3,591 gzip bytes of budget.

Browser journey / viewport / input method / original fixture / artifact paths: no new browser journey in P0. Existing browser evidence is historical and will be refreshed for P1's invalid-to-valid path.

Reproduced failures and fixes: reproduced architecturally that setup-report errors and `InitialMarketUnderfilled` are not authoritative rejection conditions. No runtime fix was made during P0; this is P1's first test-led change.

Remaining limitations or external dependencies: the publisher sources do not provide a licensed machine-readable complete dataset. P1 can certify construction from the exact loaded records, but must label that result as launch readiness rather than official-box completeness. Physical-device evidence remains a later P7 dependency.

Next concrete action: implement a pure deterministic Commons analysis beside `buildCommonsSetup`, reject invalid new games in the engine, and reuse its typed reasons in setup and server preflight.

Use Pending, In Progress, Blocked, or Verified. P7 needs separate automated and physical evidence; P9 needs separate prepared, published, and hosted-proof evidence. Do not mark the entire plan complete while required manual or hosted work is unavailable. Continue unaffected stages when an external dependency is unavailable.

Append an evidence record after each stage:

```text
Stage / date / status:
Starting revision and relevant pre-existing edits:
Files changed:
Behavior implemented and acceptance IDs exercised:
Rule sources, version decisions, and independently derived expectations:
Commands / working directory / exit codes / totals:
Browser journey / viewport / input method / original fixture / artifact paths:
Reproduced failures and fixes:
Remaining limitations or external dependencies:
Next concrete action:
```

Use ignored `tmp/` paths for synthetic browser images, generated replay reports, and release evidence. Do not add real user data to those artifacts. Suggested new filenames in this plan are design proposals, not existing APIs; prefer extending a suitable existing module where practical.

## S0. Gather Official Sources and Build a Local Test Pack

Added 2026-09-06 following the user's source-gathering approval. This is a planning amendment only: no download, import, or test-pack execution is claimed. Start here when instructed to execute the plan.

### Scope and Source Inventory

Prioritize published Bot tables and corrected cards. Use official publisher downloads first; publisher-uploaded mirrors may be fallback sources when identity and revision are verifiable. Do not bypass access restrictions or substitute unattributed scans, workshop assets, or unknown card dumps. Public download availability is not a redistribution licence. Record the observed permission statement, or `not established`, separately from source authenticity.

These links were identified during the preceding source research. Recheck them at execution time; filenames are revision hints, not proof of precedence:

| Source | URL | Intended use / limitation |
| --- | --- | --- |
| Publisher resource index | https://www.ospreypublishing.com/us/discover/gaming-resources/board-card-games/ | Discover current rulebooks, errata, spotlights, and corrected large/small cards; the index itself is not a complete card manifest |
| Classics/Legends solo rulebook | https://www.ospreypublishing.com/media/0yabfdeo/imp_rulebook_b_solo_update1-0_bgg.pdf | Nation-specific Bot tables and setup examples; reconcile against newer rules/errata |
| Classics/Legends corrected cards | https://www.ospreypublishing.com/media/2zqfj5d4/imp_corrected_cards_1-4.pdf | Targeted actual card cases, not entire nation or Commons decks |
| Horizons corrected small cards | https://www.ospreypublishing.com/media/olxpupe5/042024-imp_hrz_errata_small_cards.pdf | Corrected card cases; confirm identities, faces, and symbols visually |
| Horizons rulebook, corrected large cards, and all civilisation spotlights | Resolve links from the publisher resource index | Current rules, available Bot corrections, and nation context; direct large-card/spotlight retrieval was not verified in the preceding research |

No verified openly licensed complete machine-readable dataset for all three boxes was found in that research. Treat that as a search outcome, not proof that no dataset exists. Spotlights and card examples alone cannot establish deck completeness.

### Implementation

1. Read repository instructions, inspect worktree status, and review `docs/private-card-data-workflow.md`, `tools/card-import/cardCsvTypes.ts`, all six committed CSV templates under `private-card-data/`, and the current importer/validator scripts. Inventory existing local reference filenames and hashes before downloading duplicates. Do not overwrite existing private datasets or restore unrelated deleted scratch assets.
2. Propose local directories `reference/official-playtest/` for sources and `generated-private/official-playtest/` for derived data, scenarios, renders, and detailed reports. Before writing, verify each exact target with `git check-ignore -v -- <path>` and `git ls-files -- <path>` from the npm workspace. An ignored-looking directory can still contain tracked files. Stop writes to any tracked or non-ignored target until a safe local location is established. Do not force-add these files.
3. Download accessible publisher documents without accounts or access-control workarounds. Validate successful responses and actual PDF content, not just `.pdf` extensions; record failures as unavailable rather than accepting HTML error pages. Keep immutable revision-specific filenames and SHA-256 hashes. Do not silently replace an older source with a different revision.
4. Maintain a local structured source manifest. Required fields: source ID, publisher/uploader identity, index URL, requested and resolved URL, retrieval UTC timestamp, local relative path, byte size, SHA-256, document title, printed revision/date when present, observed permission statement and location, retrieval status, and supersession/conflict notes. Keep timestamps and unknown values honest. A public summary may contain URLs, hashes, counts, and limitations, but no transcribed content.
5. Create a coverage matrix against the six import roles: cards, nations, nation rulesets, nation strategy, Bot state tables, and Bot Trade Route tables. For each candidate record track stable ID, source/printed identifier, set/nation, relevant pages and face/table/row, supported schema fields, missing references, and status (`discovered`, `transcribed`, `visually verified`, `executable`, or `blocked`). Mark gaps explicitly; do not infer absent costs, deck membership, counts, or effects. Keep optional strategy advice distinct from mandatory rules.
6. Establish source precedence per disputed record using publisher errata and the selected rules edition, not filename dates alone. Preserve conflicting evidence and explain the chosen interpretation. Leave unresolved cases blocked. Map the chosen edition to the engine's rules version; never mix old Bot tables with new rules silently or change canonical version constants just to make imports pass.
7. Extract candidate text locally, then render and visually inspect every symbol-dependent page used in the pack. Verify resource/suit icons, quantities, negation, optionality, ordered fallbacks, actor/target identity, state-specific rows, costs, scoring conditions, and card faces. Record PDF page index and printed page label separately. OCR/text extraction is a draft, never the final authority for icons. Ambiguous fields remain blocked, not guessed.
8. Build a bounded first pack of approximately 6-10 independently expected cases, adjusted to verified source coverage. Include several actual Bot rows with conditional fallbacks and at least two corrected-card cases where executable. Store source text and derived official-content fixtures only in the ignored local directories. Use source-backed records with synthetic surrounding states when full decks are unavailable, and label these as isolated interaction tests, not complete official games.
9. For each case record source anchors, necessary records, starting state/seed, action or die sequence, independently calculated resource/zone/pending-choice/score expectations, and explicit missing-data flags. Cover both satisfied and unsatisfied conditions where applicable. Do not obtain expected outcomes by copying engine output. Missing referenced records must reject or skip with an explicit reason, never silently fall back to placeholders.
10. Validate the pack using existing per-role validators and the real engine. Inspect actual script arguments first. A partial pack is not a six-role ready import: do not weaken `private:gate`, fabricate rows, or overwrite the ordinary private CSV workspace to pass it. If existing tooling cannot run isolated local cases, add the smallest opt-in path-based harness following current test patterns, with synthetic tests of that harness. Do not document a new command as existing until implemented and run.
11. Keep default tests, source discovery, Vite imports, server initialization, CI, and release builds independent of the local pack. Never add a static import of its data into application code. Confirm packaging/build contexts, asset copying, source maps, browser persistence, and logs do not capture it; gitignore alone is insufficient. Use an isolated local browser profile/storage namespace for any actual-content UI test and never upload the pack to an online lobby.
12. Run the local cases and record pass/fail/blocked separately. If a case reproduces an engine defect, preserve the local failing seed and source anchor, create a minimal synthetic regression when possible, and record the repair prerequisite for the affected P-stage. Do not lower legality checks or broaden this stage into an unaudited engine rewrite. Re-run affected public gates for any committed-code change.
13. Hand off a public-safe coverage summary and local manifest/report paths to P0. Distinguish data gaps from engine failures and isolated interactions from full-game readiness. Retain original fixtures for P1-P9, especially P5, public property tests, screenshots, and hosted proof. Obtain separate reuse/publication scope before considering official content for a shared build.

### Acceptance and Exit

| ID | Required evidence |
| --- | --- |
| S01 | Every retrieved file has verified publisher provenance, retrieval metadata, and a matching SHA-256; failures are explicit |
| S02 | Coverage addresses all six schema roles and identifies missing fields/references without claiming complete decks |
| S03 | Every executable case has visual symbol verification, source revision/page anchors, and independent expected outcomes |
| S04 | A bounded local pack runs against the real engine with separate pass/fail/blocked results; no fake six-role readiness |
| S05 | Local paths are ignored and untracked, existing private data is preserved, and public builds/tests do not depend on or contain the pack |
| S06 | P0 receives a safe coverage/defect summary, local artifact paths, and specific unresolved source or permission questions |

Mark S0 Verified only when its applicable acceptance checks are evidenced. If downloads or unambiguous executable content are unavailable, record S0 Blocked or partially completed with precise limitations and proceed with the unaffected synthetic roadmap. Lack of complete official decks does not itself block S0. Update the stage ledger; never claim source collection or successful local tests from this plan text alone.

## P0. Establish the Baseline

1. Read the current worktree and package scripts, record HEAD and changed/untracked paths, and locate applicable instructions. Do not stage everything or reset files to obtain a clean-looking baseline.
2. Run `npm.cmd run verify:rules`, `npm.cmd run typecheck`, and `npm.cmd run perf:assets`. Record full outcomes and any baseline failures separately from new failures. Check for running local services before starting more; use another port when occupied.
3. Trace launch from `NewGameSetup.tsx` through `App.tsx`, `Board.tsx`, the engine setup pipeline, online lobby configuration, and actual server-side match creation. Identify where confirmed data is selected, how random solo Bot identity is resolved, how replacements occur, and where setup rejection can be returned safely.
4. Inventory existing save/preset storage and route-loading contracts. Read `app/src/commonsPresets.ts`, `app/src/ui/setup/CommonsPresets.tsx`, `app/src/localGameSave.ts`, `app/src/saveLibrary.ts`, `app/src/deferredView.tsx`, and `engine/src/game/version.ts`.
5. Read public rules/source anchors already recorded in the parity matrix. Before implementing minimum deck/supply requirements, check current publisher rules and errata, record URL/revision/page/date, and visually inspect symbol-dependent requirements. Do not infer a universal minimum merely from current code or the earlier recommendation.
6. Record a requirements table for normal 2/3/4-player, solo/practice effective counts, Quick Setup, Short Game, Trade Routes, campaign adjustments, and compact fictional scenarios. Include which checks are mandatory versus advisory.

Exit: baseline captured, all launch paths named, source-dependent questions bounded, and a concrete shared validation boundary chosen.

## P1. Validate Advanced Commons Composition

Primary existing files: `engine/src/setup/commonsSelection.ts`, `commonsSetup.ts`, `commonsDeckConstruction.ts`, `commonsReplacementPolicy.ts`, `commonsValidation.ts`, `commonsTypes.ts`, `setupPipeline.ts`; `app/src/commonsPresets.ts`; `app/src/ui/setup/NewGameSetup.tsx`; actual server match-creation callers discovered in P0.

### Implementation

1. Add a pure shared analysis result, preferably adjacent to engine setup. Suggested shape: status, typed blocking/advisory issues, requested/eligible/final counts, group or suit counts, replacement/removal summaries, and source/data classification. Each issue needs a stable code, severity, affected category, and required/available quantities where a requirement is known.
2. Use the same normalized data, effective player count, modes, modules, selected nations, and replacement policy as launch. Count the resulting pool after replacement, not just raw selections. Audit and correct any mismatch where the UI removes a conflicting card whose engine-approved replacement makes it valid.
3. Derive feasibility from the real construction rules: initial market slots, small-deck distribution and bottom cards, main deck, Fame setup, and Unrest allocated during setup. Show pre-setup supply and post-setup remainder distinctly. Zero Fame or a small pile is not automatically fatal in every scenario; use P0's source-backed policy.
4. Keep the analysis independent of live game RNG. Compute deterministic capacity bounds where possible. For order-dependent allocations, report conservative guarantees or conditional status and validate again against the actual construction with the launch seed. Rendering must not consume RNG or mutate caller data.
5. Detect unknown, duplicate, rejected, and conflicting requested IDs; missing references; unsupported setup options; and overlapping replacement outcomes. Distinguish invalid construction from a legal pool with potentially short pacing. Never silently delete selections to make a report green.
6. Integrate validation at the authoritative launch boundary and reuse it in the setup UI and online readiness/start paths. Invalid launches must not create an active half-initialized match or replace a healthy local autosave. Preserve typed, player-readable reasons through error handling.
7. Revalidate when source data, player count, mode, modules, nations, random Bot resolution, or selected IDs change, and again on Start. Preflight must not certify a random Bot-dependent pool until compatibility is guaranteed or the actual Bot is resolved and checked.
8. Put a compact composition summary and all blockers beside the Commons selection/launch state. Missing-card warnings currently inside Saved pools must also be visible when that disclosure is closed. Keep preset library management secondary. Provide explicit remove-unavailable or adjust-selection commands without automatic data loss.
9. Preserve compact fictional tests and tutorials through a registered scenario contract with independently checked terminal expectations. Do not introduce a generic client-supplied `skipValidation` switch. Raw recovery imports of existing saves use compatibility rules, not a new-game composition check.
10. Review version consequences. Setup-only validation should not reconstruct or invalidate an already-started game. If implementation changes ongoing rules semantics, use the canonical version policy and preserve incompatible saves for recovery/export.

### Acceptance

| ID | Required result |
| --- | --- |
| C01 | Empty custom selection, missing IDs, forbidden ownership, or invalid required composition blocks local and direct online launch with the same reason codes |
| C02 | Independent below/at/above-boundary fixtures cover every justified supply/deck requirement and supported effective player count |
| C03 | Mixed source sets, nation replacements, Trade alternates, Quick Setup, and Short Game use the same eligibility/construction decisions as launch |
| C04 | Preview is pure, does not advance RNG, and a stale valid preview cannot authorize an invalid launch |
| C05 | Compact registered fictional scenarios remain executable; arbitrary uploads cannot claim the scenario exemption |
| C06 | Errors remain visible with Saved pools closed; repairing a pool clears the correct blocker and enables Start |

Verification: extend Commons selection/setup/deck and setup-pipeline tests, add UI/shared-result checks and one direct-server rejection test, run `verify:rules` and typechecks, then exercise invalid-to-valid repair in real browser QA.

### P1 Evidence Record - 2026-09-06

Stage / date / status: P1 / 2026-09-06 / Verified

Starting revision and relevant pre-existing edits: HEAD remains `ef60fb49430e000fb5288d8c5b8e33150a8fbae8`; all unrelated dirty-worktree changes remain in place. Several touched launch/setup files already contained prior roadmap work, which was preserved.

Files changed: `engine/src/setup/commonsAnalysis.ts`, `registeredCommonsProfile.ts`, `setupCardNormalization.ts`, `setupPipeline.ts`, `engine/src/game/initialState.ts`, `engine/src/game/game.ts`, `engine/src/tests/commonsAnalysis.test.ts`, `app/src/ui/setup/NewGameSetup.tsx`, `NewGameSetupSummary.test.tsx`, `app/src/ui/styles/setup.css`, `app/src/onlineSession.ts`, `onlineSession.test.ts`, `app/src/App.tsx`, `server/src/setupValidation.ts`, `polityLobby.ts`, `pregameLobby.ts`, and focused server tests, plus this ledger.

Behavior implemented and acceptance IDs exercised: C01-C06 pass. `CommonsSetupAnalysis` reports stable blocking/advisory codes, source profile, post-replacement counts, suit/group counts, missing/rejected IDs, construction counts, and removals. Strict analysis validates Market, effective-count small decks, Tributary bottoms, Fame plus the special bottom card, initial Unrest allocation, and Short/Practice Main-deck setup exiles. Preview uses an identity shuffle and never calls caller RNG. `PrototypeGame.setup` always revalidates after random Bot resolution and actual construction; direct setup utilities do not masquerade as launch. Direct match creation, lobby create/update, and lobby start preflight before boardgame.io creation and return the same typed reasons. Setup shows all blockers outside Saved pools, offers removal of unavailable IDs, and disables local/online launch until repaired. The built-in and public fictional compact demos use repository-owned profiles; the fictional exemption requires an exact setup-metadata signature and cannot be requested through client setup data.

Rule sources, version decisions, and independently derived expectations: P0's April 2024 setup contracts drive strict thresholds. This is admission/reporting for new games only, so rules/state versions remain 3/1 and existing saves are not reconstructed or invalidated. Compact demos are explicitly labelled and remain governed by their independent synthetic scenario expectations.

Commands / working directory / exit codes / totals: focused analyzer 14/14, setup summary 26/26, server lobby 18/18, full `verify:rules` 57 files / 1,613 engine tests plus 42 audit tests, full app 247/247, full server 86/86, and engine/app/server typechecks all pass. The first full engine run exposed 15 sparse direct-constructor fixtures; enforcement was moved to real launch boundaries and the full rerun passed. The first automated browser invocation failed because sandboxed Chromium could not spawn; the approved unsandboxed rerun passed desktop and throttled mobile profiles.

Browser journey / viewport / input method / original fixture / artifact paths: Chrome at `http://127.0.0.1:5173`, pointer input. Advanced Commons began at zero selected with Start disabled and visible `custom_selection_empty`; Select Shown chose all ten built-in demo cards, the status changed to ready, and Start launched a five-card Market. Repository browser QA passed desktop (`setupMs=191`, `setupToBoardMs=126`) and 4x CPU mobile (`setupMs=599`, `setupToBoardMs=325`). Visual inspection found no overlap in the repaired desktop state.

Reproduced failures and fixes: normalized placeholder cards were previously invisible to the Advanced picker because the picker applied Commons ownership rules before legacy-card normalization; it now uses the shared normalization helper. A direct UI import of `initialState.ts` pushed the raw asset gate 3,848 bytes over its ceiling; lightweight helpers were extracted and `Board` was deferred. The final initial asset is 893,380 raw / 226,206 gzip, passing both limits and loading the Board successfully on first Start.

Remaining limitations or external dependencies: strict readiness proves the exact loaded composition can satisfy supported setup contracts, not that it is a complete official box. Physical input and screen-reader checks remain P7 work. The automated browser run required non-sandboxed Chromium launch permission on this Windows host.

Next concrete action: P2 must evaluate each of Classics, Legends, and Horizons with this exact analyzer, distinguish Demo/Available/Incomplete/No Cards Loaded, keep invalid choices visible, and preserve Advanced edits across quick-set round trips.

## P2. Show Base-Set Availability

Primary files: `NewGameSetup.tsx`, the P1 analyzer, `engine/src/cards/cardLoader.ts`, `engine/src/setup/privateDataBundle.ts`, `app/src/publicFictionalFixtures.ts`, and setup/browser tests.

### Implementation

1. Analyze Classics, Legends, and Horizons using the exact launch dataset and P1 options. Keep their three quick choices visible at all times. Display concise availability and eligible counts for each; raw counts may be exposed in detail.
2. Use explicit statuses such as Available, Incomplete, No Cards Loaded, and Demo Data. Available means the current setup passes supported construction checks; it does not mean the complete official box is present. Do not assert an expected official card total without a trusted manifest.
3. Disable unavailable choices with nearby visible reasons, not a tooltip alone. If a previously chosen set becomes invalid, retain its identity and show the issue; do not silently switch to another box. A settings/data change must recompute status.
4. Handle an empty installation without stranding the user: retain an obvious original demo/learning path and an accessible local import action. Placeholder cards must not masquerade as an available official set. Resolve how legacy placeholder setup obtains Commons metadata before counting it; normalize consistently with launch.
5. Preserve advanced selections while switching among quick sets. Returning to Advanced restores the edited IDs and revalidates them. Standard-set launch omits dormant custom IDs. Source filtering and bulk selection must preserve selections outside the active filter.
6. Carry correct set labels and availability errors into launch summary and lobby editing. Do not send locally imported datasets to a server merely to calculate availability; use the existing authorized data flow and report unsupported online data combinations accurately.

Acceptance: A01 independently exercise available/incomplete/empty data for each box; A02 data/mode/player/module changes update status; A03 keyboard and touch select a ready box in one action; A04 custom edits survive round trips; A05 default public installation still reaches a clearly identified playable demo.

Verification: table-driven availability tests using original fixtures assigned to each set ID, browser checks that actually click all quick choices, a mixed-pool filter round trip, and shared local/online setup checks. Card counts alone are insufficient evidence.

### P2 Evidence Record - 2026-09-06

Stage / date / status: P2 / 2026-09-06 / Verified

Starting revision and relevant pre-existing edits: HEAD remains `ef60fb49430e000fb5288d8c5b8e33150a8fbae8`. P2 builds on the uncommitted P1 analyzer and preserves all unrelated working-tree state.

Files changed: `app/src/commonsAvailability.ts`, `app/src/commonsAvailability.test.ts`, `app/src/ui/setup/NewGameSetup.tsx`, `app/src/ui/setup/NewGameSetupSummary.test.tsx`, `app/src/ui/styles/setup.css`, and this evidence ledger.

Behavior implemented and acceptance IDs exercised: A01-A05 pass. Classics, Legends, and Horizons are always shown and each is analyzed with the exact launch card/nation data, current mode, effective player count, modules, variants, nations, and registered profile. Statuses distinguish Available, Incomplete, No Cards Loaded, and Demo Data. Unavailable choices remain visible but disabled with a nearby exact reason. The default repository-owned Classics fixture is labelled Demo Data and remains playable. Advanced Commons remains directly reachable, retains its selected IDs while a quick set is active, and restores and revalidates them on return. The launch summary includes the chosen set and readiness label.

Rule sources, version decisions, and independently derived expectations: availability delegates to P1's source-backed construction analyzer; no card-count shortcut or official completeness total was introduced. `Demo Data` is reserved for the exact registered repository fixture. Available means the currently loaded records can construct this game, not that they comprise a complete publisher box. No rules or state version change is needed.

Commands / working directory / exit codes / totals: app typecheck passed. Focused availability/setup tests passed 31/31. Full app tests passed 26 files and 252 tests. `perf:assets` passed at 895,933 initial bytes and 226,908 gzip bytes against 980,000/250,000 limits.

Browser journey / viewport / input method / original fixture / artifact paths: Chrome at `http://127.0.0.1:5173`, desktop pointer input. The first render showed Classics `Demo Data / 10` enabled and selected, while Legends and Horizons showed `No Cards Loaded / 0`, were disabled, and had visible reasons. One click opened Advanced at zero selections and disabled Start; Select Shown chose all ten cards and enabled Start. Switching to Classics and back to Advanced restored all ten checked selections and remained launch-ready.

Reproduced failures and fixes: one server-render test matched the old one-line button markup. It was revised to assert semantic labels, disabled state, and visible reasons rather than formatting. No runtime defect remained after focused and full reruns.

Remaining limitations or external dependencies: keyboard and touch use native buttons and the one-action interaction is covered structurally; physical touch/controller observations remain P7. Empty official sets cannot be launched until the user imports owned data, while the public demo remains available. No private data is transmitted merely to calculate availability.

Next concrete action: P3 will make Mode, Players, Commons, Nations, and Start the default setup surface while moving optional settings and data/diagnostic tools behind state-preserving Advanced Setup.

## P3. Separate Basic and Advanced Setup

Primary files: `app/src/ui/setup/NewGameSetup.tsx`, `app/src/ui/styles/setup.css`, `app/src/App.tsx`, `app/src/ui/online/LobbyRoom.tsx`, setup and online tests, `../scripts/local-browser-qa.mjs`.

### Interaction Contract

The basic game configuration shows Mode, Players, Commons, Nations, and Start, plus concise selected settings and actionable validation. Session navigation such as resume, account access, and the original learning-game entry may remain compact and accessible. Optional fields move behind a clearly labeled Advanced Setup disclosure/control: expansions, variants, campaign, detailed solo controls, imports, and diagnostics.

1. Separate presentation mode from `GameOptions`. Opening/closing Advanced Setup never changes a rule or deletes selections. Keep Advanced Commons locally accessible from the Commons row, even when the rest of Advanced Setup is closed.
2. Keep ordinary solo launch possible with explicit defaults. Show the selected Bot/difficulty in the summary with an edit path. Active campaign continuation, imported data, and nondefault variants must be apparent even when controls are collapsed.
3. Preserve existing local setup, online lobby editor, campaign continuation, and saved-game-derived initial configurations. Audit fields currently lost by `buildLaunchConfig`, including nondefault replacement policy, before adding more persistence.
4. Extract cohesive sections only where necessary to manage state and loading. Keep one parent draft as the source of truth so mounting/unmounting advanced sections does not reset edits, previews, uploaded data, or error state.
5. On validation failure, reveal the affected collapsed section and place focus on its error or field. Preserve focus on disclosure collapse; avoid hidden focused elements and duplicate DOM IDs in embedded lobby editors.
6. Match the existing visual conventions, while using unframed sections, readable headings, native inputs, clear command buttons, and visible focus. Do not add decorative hero content or paragraphs explaining the interface.
7. Update browser QA to open disclosures intentionally. A missing formerly-visible selector should lead to the new real interaction, not removed coverage or forced hidden-element clicks.

Acceptance: B01 default configuration has only the five core fields/actions; B02 all optional settings remain reachable and persist across toggles; B03 imported/custom/campaign configuration is not silently reset; B04 basic launch, lobby update, and resumed setup yield the expected settings; B05 360px mobile and enlarged text retain visible errors and reachable primary actions.

Verification: focused behavior tests for draft preservation and launch payloads, browser basic and advanced journeys on desktop/mobile, and typechecks. Prefer meaningful interaction assertions over exact HTML snapshots.

### P3 Evidence Record - 2026-09-06

Stage / date / status: P3 / 2026-09-06 / Verified

Starting revision and relevant pre-existing edits: HEAD remains `ef60fb49430e000fb5288d8c5b8e33150a8fbae8`; P3 retained the existing draft and launch configuration model and preserved unrelated edits.

Files changed: `app/src/ui/setup/NewGameSetup.tsx`, `app/src/ui/setup/NewGameSetupSummary.test.tsx`, `app/src/ui/styles/setup.css`, `scripts/local-browser-qa.mjs`, and this ledger.

Behavior implemented and acceptance IDs exercised: B01-B05 pass. Basic setup exposes Mode, Players, Commons, Nations, and Start while Advanced Setup hides diagnostics, online/account controls, expansions, variants, solo details, campaigns, fictional data, and private imports from layout and the accessibility tree. Advanced Commons remains directly accessible. Disclosure state is presentation-only: module selections and custom Commons IDs remain mounted and survive close/reopen. Active modules, private data, campaign state, and solo Bot/difficulty remain visible in the launch/advanced summaries while collapsed. Password-reset links open Advanced automatically. Lobby-edit, save/resume, local launch, and multiplayer browser journeys retained their exact configuration paths.

Rule sources, version decisions, and independently derived expectations: no game option or engine semantic changed, so rules/state versions remain 3/1. P1/P2 validation remains live in both modes. Hidden optional controls are retained in the DOM for draft continuity but removed from layout and accessibility exposure with a scoped `[hidden]` rule.

Commands / working directory / exit codes / totals: focused setup tests passed 28/28; full app passed 26 files and 254 tests; engine/app/server typechecks passed. `perf:assets` passed at 896,669 raw and 227,147 gzip. The final `qa:local-browser` run passed local, practice, solo, multiplayer, fictional, import, recovery, and ordering journeys plus eight viewport profiles.

Browser journey / viewport / input method / original fixture / artifact paths: Chrome pointer/keyboard checks confirmed the initial accessibility tree contained only the five core setup fields. Advanced Setup revealed all optional controls; Trade Module and Quick Setup remained checked after collapse/reopen and their summary remained visible. Automated profiles passed desktop 1440x900, wide 1920x1080, Steam Deck 1280x800, tablet 760x900, phone 360x800, phone 390x844, landscape 844x390, and 200% text. Final measured setup-to-board was 111 ms desktop and 330 ms under 4x CPU mobile throttling.

Reproduced failures and fixes: setup component display rules initially overrode the HTML `hidden` attribute; a scoped `display: none !important` restored layout and accessibility hiding. At 200% text, `Multiplayer` clipped in a fixed compact mode grid; a font-relative minimum track now stacks it naturally. Browser selectors and waits that assumed the former always-visible diagnostics and unadorned Commons names were updated to perform the real disclosure journey and use availability-aware names.

Remaining limitations or external dependencies: controller, physical touch, and screen-reader observations remain P7. The native disclosure button is keyboard reachable and the automated accessibility tree is correct; P7 will provide broader scanner and physical evidence.

Next concrete action: P4 will add a separate whitelisted settings library, keep Commons-only presets compatible, and apply full presets atomically before P1/P2 readiness reports the result.

## P4. Save Whole-Setup Presets

Primary files: `app/src/commonsPresets.ts`, `app/src/ui/setup/CommonsPresets.tsx`, `app/src/localGameSave.ts`, `app/src/saveLibrary.ts`, `NewGameSetup.tsx`, `App.tsx`, and online setup serialization.

### Data and Persistence

1. Introduce a separate versioned settings library, suggested `app/src/setupPresets.ts`, with stable ID, user name, schema version, compatible rules reference, relevant `GameOptions`, player-to-nation IDs, and optional solo Bot ID. Use the existing shared option validators instead of inventing permissive duplicate normalization.
2. Whitelist every imported/exported field. Include mode, count, Commons set/explicit IDs, expansions, variants, replacement policy, solo difficulty, and campaign mode when applicable. Exclude private bundles, card definitions, credentials, account IDs, match IDs, game state, and ongoing campaign records. Continuing a campaign remains a separate flow.
3. Validate enums, counts, array uniqueness/length, seat mappings, bounded strings/file sizes, and nested unknown fields. Unknown/future preset versions are recoverable/exportable but not applicable. Do not silently normalize a fundamentally incompatible rules definition into a current preset.
4. Apply a preset atomically to the draft, then run P1/P2 readiness. Missing nation/card data should preserve the intended IDs, show exact blockers, and leave the existing game/autosave alone. Show a concise change preview when replacing a nonempty edited draft.
5. Support save-new, choose/load, rename, duplicate, replace with overwrite confirmation, delete, export, and import. Primary access should be compact; place management operations behind a disclosure/menu. Duplicate names must not make identity ambiguous.
6. Reuse the existing lock plus snapshot concurrency pattern. Handle stale-tab edits, malformed libraries, quota errors, and interrupted writes without overwriting newer data. Preserve recoverable original bytes and avoid logging private content discovered in malformed imports.
7. Keep Commons-only presets compatible. Importing/applying a Commons-only preset changes only Commons. Do not repurpose its storage key or silently rewrite it into a full-game schema.

Acceptance: S01 each supported setting round-trips; S02 all seats and solo/campaign-mode settings apply coherently; S03 invalid/future input leaves the draft/library untouched; S04 unavailable references block launch without data loss; S05 concurrent/quota failures preserve the prior library; S06 exported presets contain only allowed settings/IDs; S07 existing Commons-only presets still work.

Verification: schema and storage failure tests, a multi-tab browser write conflict, full-preset save/load/export/import, lobby application, and continued save recovery. Use fake account/credential fields in rejection tests.

### P4 Evidence Record - 2026-09-06

Stage / date / status: P4 / 2026-09-06 / Verified

Starting revision and relevant pre-existing edits: HEAD remains `ef60fb49430e000fb5288d8c5b8e33150a8fbae8`; all prior and unrelated worktree changes remain preserved. The new settings library uses its own key and does not migrate or rewrite Commons-only presets or saved games.

Files changed: `app/src/setupPresets.ts`, `app/src/setupPresets.test.ts`, `app/src/ui/setup/SetupPresets.tsx`, `app/src/ui/setup/NewGameSetup.tsx`, `app/src/ui/styles/setup.css`, `scripts/local-browser-qa.mjs`, and this ledger.

Behavior implemented and acceptance IDs exercised: S01-S07 pass. The version-1 setup preset schema round-trips mode, player count, Commons set and explicit IDs, expansions, variants, replacement policy, solo difficulty, campaign mode, every player nation, and solo Bot. It excludes private data, credentials/accounts/matches, game state, and campaign records. Strict nested whitelists, enum/count/ID bounds, unique arrays, exact seat maps, current rules identity, and coherent solo/Supreme Ruler settings reject malformed input without normalization. Future schema/rules imports remain exportable but unapplied. The independent revisioned library uses a Web Lock, stale-snapshot check, one-record write, and exact prior-byte backup. The UI supports save, select/change preview, apply, rename, duplicate, confirmed replace/delete, export, import as a new identity, refresh, and recovery export. Duplicate names display ID suffixes. Applying batches the draft, preserves imported data and autosaves, keeps missing IDs, exposes exact unavailable nation/Bot or Commons blockers, and disables launch. Existing Commons-only presets passed later in the same browser journey.

Rule sources, version decisions, and independently derived expectations: presets store `CURRENT_RULES_VERSION` 3 and are refused across a different rules identity rather than silently migrated. They contain campaign mode only; ongoing campaign progress remains in its separate flow. No state or rules version changed. `replacementPolicy`, previously omitted by `buildLaunchConfig`, is now retained by preview, launch, and presets.

Commands / working directory / exit codes / totals: setup preset unit tests passed 13/13; full app tests passed 27 files and 267 tests; engine/app/server typechecks passed. `verify:rules` passed 57 files / 1,614 engine tests plus 42 audit tests. `perf:assets` passed at 911,243 initial bytes and 231,024 gzip against 980,000/250,000 ceilings. Expanded `qa:local-browser` passed.

Browser journey / viewport / input method / original fixture / artifact paths: the ordinary browser gate saved a complete setup, changed player count, expansion, and variant, displayed a three-group preview, and atomically restored the original. It exported and parsed the JSON to prove required settings and forbidden-field absence, imported a separate identity, renamed, duplicated, replaced, and deleted it. A same-document simulated stale-tab revision caused the save to reject with the exact conflict message while newer raw bytes remained identical. The run then passed private imports, Commons-only presets, all save/recovery and gameplay journeys, and eight responsive profiles.

Reproduced failures and fixes: QA initially raced a pre-existing status message and then counted an accessibility wrapper instead of the concrete select. The gate now waits on actual library growth using the select's option count. A retained browser profile also showed why tests must compare count deltas rather than assume an empty library. No persistence defect remained.

Remaining limitations or external dependencies: incompatible imported preset bytes are held only for user export during the current page session and are never applied or persisted into the active library. Physical-device and screen-reader observations remain P7. The preset contains stable IDs, so portability still depends on loading owned data that supplies those references; absence is intentionally blocking, not destructive.

Next concrete action: P5 will first write an original short teaching script with independently calculated checkpoints, then implement it as a registered fictional scenario using ordinary engine moves and ordinary save/resume.

## P5. Add an Original Guided Game

Primary files: `app/src/publicFictionalFixtures.ts`, `data/fictional-regression/`, `engine/src/tests/helpers/fictionalScenarioRunner.ts`, `engine/scripts/run-fictional-scenarios.ts`, `app/src/Board.tsx`, `app/src/ui/layout/BoardLayout.tsx`, selection/payment/scoring modules, and local save APIs.

### Teaching and Execution

1. Write a short original teaching script before UI code. Proposed chapters: play and pay; Progression and reshuffle; choose/resolve a reaction; Trade and legal targets; ordering and final scoring. Aim for roughly 10-15 minutes, verified by a walkthrough rather than claimed from code.
2. Use original names, descriptions, and visual assets. Existing compact regression decks are test probes, so adapt or add deliberate teaching fixtures rather than presenting every raw regression as a lesson.
3. Prefer one coherent real game. If an unsupported transition requires separate chapters, label chapter resets explicitly. Each chapter records initial seed/state contract, available choices, engine move sequence, completion predicate, expected resource changes, and independently calculated final result.
4. Reuse actual engine moves and board controls. Advance only when authoritative state/events satisfy a step. Guidance may highlight a legal target and explain the game rule; it must not dispatch a fabricated success, change state to skip payment, or introduce alternate gameplay rules.
5. Support start, pause, continue, restart chapter with confirmation, and exit to setup. Keep teaching UI scoped to a clearly entered learning mode. Do not show tutorial help paragraphs during ordinary games.
6. Persist lesson/version/chapter metadata and progress separately from competitive/account statistics. Integrate engine snapshots through the real save codec with fixture identity/version checks; preserve incompatible progress for recovery rather than silently restarting it.
7. Do not overwrite an active autosave or user slot when starting the tutorial. Use a dedicated learning slot/storage identity and verify normal play can be resumed after exiting. Avoid granting wins, campaign rewards, or online stats from teaching chapters.
8. Provide keyboard/controller focus, touch-friendly target highlighting, text alternatives, and a reduced-motion presentation. Load the lesson content on demand using the P8 loading boundaries.

Acceptance: T01 every step is satisfied by a real legal move; T02 wrong/stale action cannot advance the lesson; T03 reactions and resumed interruptions teach the actual timing; T04 all chapter terminal arithmetic is independently justified; T05 reload continues the correct step without double rewards; T06 exit/restart preserves ordinary saves and account statistics; T07 a new user can enter learning mode without private data.

Verification: execute every lesson through the scenario runner and the UI; save/reload during payment choice, reaction, and ordering; finish at least one teaching game; record a timed user-perspective walkthrough with unresolved confusion notes.

### P5 Evidence Record - 2026-09-06

Stage / date / status: P5 / 2026-09-06 / Verified locally with original public-safe fixtures.

Files changed: `docs/guided-game-script.md`, `app/src/guidedGame.ts`, `app/src/guidedGame.test.ts`, `app/src/publicFictionalFixtureMetadata.ts`, `app/src/App.tsx`, `app/src/Board.tsx`, `app/src/ui/layout/GuidedGamePanel.tsx`, `app/src/ui/layout/BoardLayout.tsx`, `app/src/ui/layout/GameLogPanel.tsx`, setup/board styles, and the fictional fixture/runner files.

Behavior and acceptance evidence: T01-T07 pass through six separately labeled real-engine chapters covering action payment, Progression/reshuffle, reactions, Trade, Solstice ordering, and scoring. Advancement is derived from authoritative state or durable public events and rejects wrong/stale actions. Start, pause, continue, confirmed restart, and exit use a dedicated `polity-engine.guidedGame.v1` record wrapping the real save codec with lesson, fixture, and rules versions. Incompatible bytes remain recoverable. Learning mode does not write the ordinary autosave, account history, campaign rewards, or online statistics. The natural Solstice-ordering F09 scenario saves/restores at the interruption and resolves both players' choices.

Commands and user-perspective evidence: guided tests passed 7/7; the fictional runner passed 11 scenarios and 19 checkpoints, including independently expected F05 3-3 scoring and F09 ordering. A live browser walkthrough started Chapter 1, selected Foundry Lantern, paid through the ordinary Play control, observed Actions 2 / Materials 4 / Exhaust 1, completed the step, exited with the ordinary autosave timestamp unchanged, and continued the saved chapter. The walkthrough also reached Chapter 2's actual cleanup/reshuffle. Automated execution proves the flow but does not establish a human 10-15 minute completion time; that timing remains provisional in the teaching script.

## P6. Add Property-Based Engine Assurance

Primary files: `engine/src/tests/gameplayStress.test.ts`, Commons tests, `solsticeInterruption.test.ts`, `playerView.test.ts`, `scoring.test.ts`, `undoPolicy.test.ts`, shared fixture helpers, and `package.json` test scripts.

1. Inspect installed dependencies first. Use a proven property-testing library such as `fast-check` if none exists; check official documentation and compatibility before adding a pinned, justified dev dependency and lockfile changes. Do not invent a new random/shrinking framework.
2. Generate valid original card pools and separately generate malformed configurations. Vary box assignment, suits, requirements, nation conflicts, replacement metadata, modes/counts, and modules. Keep explicit constructed rule tests as independent anchors.
3. Model actions by their preconditions. Generate legal move sequences with minimum progress/coverage requirements; a run that only skips invalid commands is not useful. Exercise representative optional choices as well as a deterministic default.
4. Assert setup invariants: no unintended duplicate physical IDs across exclusive zones, only eligible final cards, correct replacement accounting, requested/missing/rejected attribution, legal initial allocation, and P1 acceptance agreement with launch. Account explicitly for attachments and cards moved to set-aside/delayed pools.
5. Assert gameplay invariants: finite/nonnegative resources where rules require them; legal zone transfers; source ownership through reactions; immediate terminal stop; no replayed effect after resume; and no hidden-information exposure through player views or undo. Conservation laws must explicitly include created tokens/cards and authorized gains/losses.
6. For the same seed and actions, serialize/restore through the actual codec and compare meaningful authoritative state, PRNG continuation, event order, choices, and terminal result. Exclude timestamps only with a documented reason; do not erase divergent gameplay fields from comparisons.
7. Check scoring purity and additive consistency, supplemented by independent synthetic arithmetic. Agreement between two callers of the same scoring helper cannot establish fidelity by itself.
8. Persist every failure's seed, shrink/replay path, versions, public fixture definition, and minimal command trace. Add a deterministic regression for each repaired bug. Keep reports free of real private card payloads.
9. Add a bounded default CI/local profile (initial target: 100 cases per focused property) and an opt-in extended profile (initial target: 1,000). Record measured duration and adjust coverage deliberately. Wire the bounded profile into `verify:rules` and script-contract tests; expose exact seed/replay commands.

Acceptance: E01 deliberate injected faults are detected during development; E02 a recorded failure replays exactly; E03 shrink output is a legal diagnostic trace or a clearly classified malformed-input case; E04 generated families cover 2/3/4-player, solo/practice, both construction paths, mixed sets, and interruption/resume; E05 ordinary gates execute the new properties within a documented runtime budget.

Verification: run all properties, replay at least one deliberate development failure after removing the fault, then full `verify:rules`. Never alter expected legality just to increase the pass count.

### P6 Evidence Record - 2026-09-06

Stage / date / status: P6 / 2026-09-06 / Verified.

Files changed: `engine/src/tests/propertyAssurance.test.ts`, `scripts/run-engine-properties.mjs`, `engine/package.json`, root `package.json`, and `package-lock.json`. `fast-check` is pinned as a development-only dependency and does not enter the browser runtime.

Behavior and acceptance evidence: the bounded 100-run profile and opt-in 1,000-run profile generate deterministic valid states across 2/3/4-player, solo/practice, variants, mixed Commons construction, and Trade. They assert nonnegative finite resources, legal exclusive-zone placement, JSON restore equality, scoring purity/additivity against independent arithmetic, and hidden generated IDs absent from player/spectator views. `POLITY_PROPERTY_RUNS`, `POLITY_PROPERTY_SEED`, and `POLITY_PROPERTY_PATH` provide exact replay and shrink controls. Deliberate development failures caught the engine's template-ID reuse assumption and incomplete solo table fixture; the properties were corrected to enforce the actual physical-zone contract and the invalid fixture was repaired without weakening engine legality.

Commands and totals: bounded properties passed 3/3 in about 0.5 seconds; extended properties passed 3/3 with 3,000 generated cases in about four seconds. The bounded file is discovered by the ordinary engine pretest. Final `verify:rules` passed 58 files / 1,617 engine tests plus 42 independent audit tests.

## P7. Verify Accessibility and Physical Inputs

Primary files: setup/board components, `app/src/ui/controller/keyboardControls.ts`, `gamepadControls.ts`, `app/src/ui/styles/`, `../scripts/local-browser-qa.mjs`, and focused browser contract tests.

1. Add an appropriate dev-only accessibility scanner, preferably `@axe-core/playwright` using its official documentation. Run it on rendered routes/states, not only an empty shell. Keep the scanner out of the production bundle.
2. Cover Basic Setup, Advanced Commons, preset import/error states, advanced settings, local board, action/payment choice, ordering, card inspection, score summary, guided game, save recovery, and lobby editing. Test relevant owner/opponent/spectator surfaces.
3. Resolve applicable WCAG A/AA findings, including labels, names, landmarks, contrast, roles, disclosure state, form errors, focus visibility/order, and dialog containment. Record precise reviewed exceptions; do not blanket-disable a scanner rule or hide whole regions to get zero violations.
4. Manually inspect keyboard-only traversal, disclosure expansion/collapse, error focus, modal return, browser back/navigation, live announcements, and absence of keyboard traps. Automated scanning cannot prove these behaviors.
5. Verify at 360x800, 390x844, 844x390, 760x900, 1280x800, 1440x900, and 1920x1080, plus actual 200% browser zoom and enlarged text as separate checks. Root font resizing alone is not browser zoom. Use 320 CSS-pixel reflow checks where appropriate and inspect exceptions for inherently two-dimensional boards.
6. Check touch controls at least 44 CSS pixels where feasible, long names, overlapping text, scrolling, focused-item visibility, and reduced motion. Capture and inspect original-fixture screenshots, not just a boolean report.
7. Extend simulated controller coverage for connect/disconnect, held buttons, debounce, axes/dead zones, focus traversal, confirmation/cancellation, overlays, and Start while a required choice is pending.
8. Complete a physical controller/touch protocol when hardware is available: record device/browser/OS, enter setup, choose a box, compose a pool, save/load it, launch, pay, order, open/close details, pause/reload the lesson, and finish. Test a real touch screen separately from an emulated viewport. A screen-reader pass should verify announcements and target names with an available installed reader.
9. If hardware or a screen reader is unavailable, record exact unperformed cases, continue P8 and release preparation, and leave the corresponding acceptance item open. Do not call synthetic button injection a physical test or claim accessibility certification.

Acceptance: X01 no unreviewed applicable scanner failures on scoped states; X02 keyboard journeys complete with predictable focus; X03 target sizes/reflow/zoom pass; X04 simulated controller lifecycle passes; X05 physical controller/touch protocol has observed results; X06 screen-reader review has observed results or an explicit remaining limitation.

Verification: dedicated scanner command included in an appropriate aggregate, desktop/mobile screenshots, keyboard walkthrough, and an evidence table distinguishing automated, manually inspected, and physical checks.

### P7 Evidence Record - 2026-09-06

Stage / date / status: P7 / 2026-09-06 / Automated and browser-observed scope verified; physical-device acceptance remains open.

Files changed: `scripts/accessibility-qa.mjs`, root `package.json`, `package-lock.json`, `app/src/ui/layout/GameLogPanel.tsx`, setup styles, and existing keyboard/gamepad/browser coverage. `@axe-core/playwright` is pinned as a development-only dependency.

Evidence table: the WCAG A/AA axe scan reports zero violations on Basic Setup, Advanced Setup, guided board, and guided-card-selected states with reduced motion. It initially found active-helper contrast, launcher-heading contrast, and an unfocusable scrollable log; all three were fixed without suppressing rules. Full browser QA passed keyboard-driven setup/play paths and eight profiles: 1440x900, 1920x1080, 1280x800, 760x900, 360x800, 390x844, 844x390, and enlarged text. Simulated controller unit coverage passes mapping, connect/disconnect, dead zones, repeat/debounce, confirmation, required-choice blocking, and modal focus return.

Explicit limitations: no physical controller or real touch screen was available, and no installed screen reader was exercised. X01-X04 are covered by automated/rendered evidence; X05 and the observed screen-reader portion of X06 remain unperformed. This is not an accessibility certification, and synthetic button injection is not reported as physical input evidence.

## P8. Reduce Initial Loading Cost

Primary files: `app/src/App.tsx`, `app/src/deferredView.tsx`, `app/src/ui/setup/NewGameSetup.tsx`, `app/src/ui/layout/BoardLayout.tsx`, `app/src/ui/layout/EndGameSummary.tsx`, `app/src/publicFictionalFixtures.ts`, `types/vendor-shims.d.ts`, `../scripts/check-asset-budget.mjs`, `../scripts/large-board-profile.mjs`, and browser QA.

1. Measure a production baseline after P3-P7: manifest static dependencies, raw/gzip initial bytes, first-load requests, parse/startup work, setup-to-board transition, and first use of advanced/lesson screens. Use fixed viewports/CPU throttling and at least five comparable runs; report medians and variability.
2. Inspect the graph for static imports retaining expensive optional content. Candidate boundaries are private import/preview tooling, advanced preset management, fictional lesson data, board diagnostics, and potentially the board client. Preserve the existing deferred screens; a dynamic import is ineffective if another static import still retains the module.
3. Keep basic setup and essential legality analysis available promptly. Split by coherent feature, extract lightweight shared types/helpers where that breaks a real dependency cycle, and avoid a collection of tiny request-heavy chunks.
4. Preserve the current draft when optional modules mount/unmount. Provide scoped loading and recoverable load-error states with retry; avoid a whole-app blank screen on an unavailable chunk. Ensure a new deployment with old cached HTML can recover without losing a current game.
5. Test cold and warm entry, direct navigation, first Advanced click, first tutorial launch, first board move, and terminal summary loading. Check that optional modules are not fetched before their trigger and that required assets do appear afterward.
6. Keep current hard ceilings at 980,000 raw / 250,000 gzip. Performance objective: at least a 10% reduction from the measured pre-P8 initial bytes, with no unexplained median setup-to-board regression above 10%. If evidence shows the target conflicts with actual startup/interaction performance, record a concrete revised target and rationale; do not silently raise the existing limits.
7. Keep property-testing and accessibility dependencies out of runtime. Check local and hosted content paths, chunk-load errors, hidden-data redaction, and terminal/account side effects after splitting.

Acceptance: L01 hard asset ceilings pass; L02 measured reduction meets the target or a documented evidence-based revision; L03 optional requests are genuinely deferred; L04 all routes and loading-error recovery preserve state; L05 real interaction timings and screenshots remain usable on throttled mobile and desktop.

Verification: `perf:assets`, `perf:board`, focused deferred-view error tests, typechecks, and production-browser journeys. Do not count merely raising a Vite warning threshold as an optimization.

### P8 Evidence Record - 2026-09-06

Stage / date / status: P8 / 2026-09-06 / Verified.

Files changed: `app/src/App.tsx`, `app/src/publicFictionalFixtureMetadata.ts`, `app/src/publicFictionalFixtures.ts`, `app/src/ui/setup/NewGameSetup.tsx`, and lazy-load-aware app/browser tests. Basic Setup is loaded through the existing recoverable deferred-view boundary; full fictional fixture JSON loads only when the learning game requests it.

Measured evidence: the post-P7 production baseline was 925,912 initial raw bytes / 234,995 gzip. The final production build is 755,322 / 195,307, reducing raw initial JavaScript by 18.4% while retaining the 980,000 / 250,000 hard ceilings. Coherent first-use chunks include NewGameSetup 70.22 kB, public fictional fixtures 20.33 kB, Board 93.29 kB, and existing private tooling boundaries. The property and accessibility packages remain development-only.

Interaction evidence: `perf:board` with 210 additional original cards measured desktop resume at 113 ms with five 66-72 ms interactions, and 4x-CPU mobile resume at 337 ms with five 99-112 ms interactions. Final full browser QA measured setup at 170 ms desktop / 604 ms 4x mobile and setup-to-board at 97 ms / 320 ms, confirmed deferred loading, and passed every cold setup, first board, responsive, save, and gameplay journey. The lazy split exposed two QA cold-load races; the checks now wait for the rendered setup contract and the complete rerun passes.

## P9. Prepare, Commit, and Prove a Hosted Release

Primary files: `docs/release-automation.md`, `docs/production-playtest-runbook.md`, `docs/hosted-release-handoff.md`, `docs/deployment.md`, `../scripts/release.mjs`, release tests, hosted smoke/browser scripts, and the checked-in service configuration they validate.

### Candidate Preparation

1. Review actual diffs and untracked files against the staged implementation and evidence. Identify pre-existing changes needed for the candidate versus unrelated artifacts. Do not use `git add .`; stage exact reviewed paths. A commit must include necessary untracked runtime/tests as well as tracked edits.
2. Run `git diff --check`. Inspect the proposed staged diff for private content, secrets, generated artifacts, unintended migrations, and silently changed rule expectations. Keep source PDFs and private images out of the candidate. Do not revert the pre-existing scratch deletions just to simplify review.
3. Run both local aggregate gates after the last runtime edit. Ensure they discover P1-P8 coverage and use real assertions. Update release notes and this ledger with implemented behavior, local evidence, and unresolved manual checks.
4. When unrelated work remains outside the candidate, verify the actual candidate tree in an isolated checkout/index-derived tree before calling its tests green. Tests in a broader dirty worktree can pass because of files missing from the commit.
5. Review persisted-match compatibility and backup/restore requirements. Run a disposable local backup/restore exercise and cleanup workflow from the runbook. The `ops:rehearsal` ready report checks documentation; it is not evidence that these operations occurred.
6. Produce a reviewable candidate: intended files, commit message, successful gates, full release target, and known limitations. Resolve any missing authorization for committing/pushing/deploying using the current session scope only at this point. Do not ask again when already authorized.

### Publication and Hosted Proof

1. Commit the reviewed candidate and publish through the repository's existing branch/review workflow. The current helper deploys only a full SHA matching remote `main`; do not force-push or pretend a local-only commit is deployable. Record the actual full SHA and verify the remote tip.
2. Read current release documentation and verify service ID/origin/repository/branch/configuration. Use credentials already configured through the supported environment without printing them. Treat service IDs in old notes as discovery hints, not authority.
3. Run the helper dry-run for the exact SHA, then the authorized live command. Existing documentation shows this syntax; substitute verified values:

```powershell
npm.cmd run release -- --commit <full-sha> --service <verified-service-id> --origin <verified-origin> --dry-run
npm.cmd run release -- --commit <full-sha> --service <verified-service-id> --origin <verified-origin>
```

4. Preserve helper locking, bounded polling, deployment reuse, and uncertain-POST recovery. Do not submit another deployment blindly after a timeout. Do not silently rewrite configuration drift.
5. Set `POLITY_EXPECTED_COMMIT` to the full SHA for any standalone hosted check and `POLITY_HOSTED_BASE_URL` to the verified origin. Run hosted smoke and browser QA, including the new basic/advanced availability, preset, and teaching journeys. Check both backend/live identity and frontend embedded identity before and after proof.
6. Use only disposable synthetic test accounts/rooms allowed by the hosted QA workflow. Clean up only those known test resources; never use global Clear All Games against production as a rehearsal. Record cleanup results and leave real games untouched.
7. Record live SHA, deployment ID, origin, full gate outcomes, hosted checks, and remaining device/accessibility limitations. Handle a bad release using the documented rollback procedure only after assessing compatibility with current saved matches and preserving storage.

Acceptance: R01 exact candidate tested; R02 reviewed commit is published; R03 live service/frontend match that SHA; R04 hosted smoke/browser feature journeys pass; R05 owned QA resources are cleaned up; R06 recovery evidence and known limitations are recorded. A successful local build or a Render live status alone is insufficient.

If credentials, remote access, deployment authorization, or hardware are unavailable, complete candidate preparation and record precisely what remains. Never mark unpublished or untested hosted work Verified.

### P9 Candidate Evidence Record - 2026-09-06

Stage / date / status: P9 candidate preparation / 2026-09-06 / Verified; publication and hosted proof pending.

Candidate boundary: 126 reviewed modified/untracked files are staged. The index contains no source-pack/private-data directory, generated-private output, `tmp` artifact, PDF, image, CSV, or credential-shaped content. All pre-existing deleted scratch renderings, extracted publisher images, and local logs remain unstaged and untouched. `git diff --cached --check` passes.

Exact-tree proof: the staged index was exported to `tmp/release-candidate-2026-09-06-2019`, then `npm.cmd ci` installed the exact lockfile. Both `verify:improvements` and `verify:production-local` passed from that isolated tree. The former included 16 release-helper tests, 1,618 engine tests, 42 independent rules-audit tests, 37 QA-script tests, 274 app tests, 86 server tests, typechecks, 11 fictional scenarios / 19 checkpoints, multiplayer smoke, complete browser QA, zero scoped axe violations, and the 755,322 raw / 195,306 gzip asset result. The latter repeated typechecks, 86 server tests, the production build, and operations rehearsal.

Operations evidence: a disposable local production-shaped smoke created and cleaned its synthetic lobby. The resulting `accounts.json` and `pregame-lobbies.json` were copied to a private-style backup and restored separately; relative paths and SHA-256 hashes matched, and a fresh local hosted smoke booted successfully from the restored directory and cleaned its own lobby. No live storage or real account was touched.

Known limitations: npm reports 21 dependency advisories (2 low, 7 moderate, 11 high, 1 critical); they were not automatically rewritten because `npm audit fix --force` can introduce unrelated breaking upgrades. Physical controller, real touch-screen, and installed screen-reader observations remain unperformed. The ordinary private-data gate remains intentionally blocked because the six ignored private CSV sources contain no rows; this does not affect the public-safe release candidate.

Next concrete action: commit and push the exact staged candidate to `origin/main`, run the release helper dry-run against the verified Render service/origin, then deploy and run commit-pinned hosted smoke/browser proof. The ignored release report is the authoritative place for the final self-referential commit SHA and deployment ID.

## 4. Commands and Test Discipline

Inspect scripts before running them. Existing commands from the npm workspace:

```powershell
npm.cmd run verify:rules
npm.cmd run typecheck
npm.cmd run test -w app
npm.cmd run test -w server
npm.cmd run test:local-qa-scripts
npm.cmd run smoke:fictional-game
npm.cmd run qa:local-browser
npm.cmd run perf:assets
npm.cmd run perf:board
```

Run focused tests while implementing, then the relevant full gates when engine behavior or shared contracts change. `engine/scripts/pretest-check.mjs` historically did not forward test filters, so confirm its behavior before assuming `npm test -w engine -- <file>` is focused. The installed direct entry point is:

```powershell
node .\node_modules\vitest\vitest.mjs run --root engine src/tests/commonsSelection.test.ts src/tests/commonsSetup.test.ts
```

Add proposed property/accessibility commands when their implementation exists; make script-contract tests verify they are included in the appropriate aggregate. Do not document a nonexistent command as a passed check.

Final required local commands, separately with captured exit codes:

```powershell
npm.cmd run verify:improvements
npm.cmd run verify:production-local
```

`verify:improvements` currently includes release tests, pre-private verification (engine/audit, QA scripts, typechecks, app/server tests, private status, fictional/multiplayer smoke, browser QA), and asset limits. `verify:production-local` includes production build/server checks and operations documentation readiness. A header-only `private:status` result is expected when the ordinary private workspace remains empty; S0's separate partial pack does not make that workspace ready. Do not populate unrelated private files or weaken gates to change that status. Public aggregate results and opt-in local official-content results must be reported separately.

Do not call partial, interrupted, or failed aggregates green. Repeat a full aggregate after repairing its failing code, and record the original failure. Avoid broad reruns for documentation-only changes after all applicable checks pass.

## 5. Cross-Stage User Walkthrough

1. Open a fresh installation. Identify demo data, see availability for all three boxes, and enter an original playable demo without importing private content.
2. Load original synthetic fixtures representing different source boxes. Select each available box in one click; make one invalid by changing player/module settings and see the precise reason.
3. Enter Advanced Commons, filter sources, select/clear shown cards, switch to a quick box and back, and verify edited selections remain. Repair an invalid composition and launch.
4. Return to setup, expose optional settings, configure solo or a multiplayer lobby, collapse/reopen settings, and verify the summary and eventual launch preserve every selection.
5. Save a full setup preset, change the draft, preview/apply the preset, and round-trip import/export. Remove a referenced synthetic card and verify a recoverable blocker. Exercise a second-tab conflict.
6. Start the guided game, resolve payment/Progression/reaction/Trade/ordering, reload mid-interruption, and finish with independently expected scores. Exit and resume the untouched ordinary save.
7. Repeat key journeys with keyboard, simulated controller, and responsive layouts. Complete the documented physical device and screen-reader checks where available.
8. Repeat production cold-load/first-use paths after splitting, then hosted paths against the exact published commit. Keep the report explicit about local versus live evidence.

## 6. Plan Audit and Handoff

This plan was checked against current source paths, script names, current version constants, the latest Commons simplification, and the release helper's remote-main constraint. It deliberately leaves exact minimum supplies to source verification, separates ordinary games from registered small scenarios, preserves existing saves, accounts for replacements/random Bots and direct launch bypasses, distinguishes enlarged text from zoom, and distinguishes operations documentation readiness from exercised recovery.

During execution, update assumptions when source evidence contradicts them. Do not turn an aspirational requirement into a rule without a citation and an independent fixture. Do not use the old plan's completed status to certify these new stages.

Completion requires implementation, applicable automated tests, user-perspective inspection, compatibility decisions, and evidence. Distinguish a prepared release from a published release and a simulated device from physical hardware. For an interruption/compaction handoff, record the current stage, files, last completed command, any active process, unresolved issue, and next concrete action.

Paste-ready execution instruction:

> Read `docs/superpowers/plans/2026-09-06-next-improvements-sol-execution-plan.md` and follow S0, then P0-P9. Pursue each stage as an explicit goal and update the evidence ledger incrementally. Keep S0's publisher sources and derived test pack isolated and local-only; use original synthetic data for public fixtures, CI, the tutorial, and hosted proof. Preserve unrelated work and complete the required verification. Follow the session's publication authorization when reaching P9; prepare the exact tested release candidate before requesting any missing authorization. Report actual remaining source, hardware, or hosted dependencies without declaring them complete.
