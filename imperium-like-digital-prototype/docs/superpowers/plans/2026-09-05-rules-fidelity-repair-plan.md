# Rules Fidelity Repair Plan

Status: complete for the authorized public-safe local scope. Hosted release remains separately authorized work. See the [closure report](2026-09-05-rules-fidelity-closure.md).

## Objective And Boundaries

Close all 11 findings in the [independent audit](2026-09-05-rules-fidelity-audit.md), repair their integration surfaces, and establish a repeatable source-backed correctness gate. The recorded baseline is 25 failed and 15 passed fidelity checks, with 1,540 existing engine tests passing. Those numbers are audit evidence, not fresh execution results from this planning step.

Use public-safe synthetic fixtures throughout. Do not require private data, publish source PDFs, silently change saved-game history, or claim complete official card/nation coverage. Runtime work, commits, and deployment are later execution steps, not authorized by this planning document alone.

Success has three distinct levels:

1. Known-gap closure: all 11 findings repaired with integration evidence and no weakened expectations.
2. Public engine validation: expanded operator, variant, timing, persistence, and user-workflow gates pass within a documented coverage boundary.
3. Dataset certification: later, separately scoped validation of individual cards, nations, and Bot tables against authorized source material. Levels 1-2 do not imply level 3.

## Working Rules

- Before changing each contract, independently reread the cited rule and relevant exceptions, including icon-sensitive text. Treat local notes and old tests as implementation history, not the oracle.
- Maintain a finding ledger with source/page, affected entry points, failing probe IDs, new integration tests, save implications, and verification results. If evidence overturns an audit expectation, document why rather than quietly changing the test.
- Inspect existing helpers before introducing abstractions. Consolidate duplicated decisions only where drift caused a defect or shared ownership is clear.
- For each milestone, add or preserve failing evidence, implement, reconcile contradictory tests with a source reference, then run focused and full relevant checks. Preserve all previously repaired checks and all passing controls.
- Never solve a failure with `skip`, expected-failure markers, reduced assertions, or accepting multiple incompatible outcomes. Do not delete a contradictory test without replacing its useful coverage.
- Preserve unrelated worktree changes. Keep changes in reviewable milestone-sized commits when implementation and commits are authorized.

## Sequence And Finding Coverage

| Milestone | Scope | Depends on | Original probes |
| --- | --- | --- | --- |
| M0 | Freeze evidence and map contracts | None | All R01-R40 |
| M1 | Token lifecycle: F1, F2 | M0 | R01-R07 |
| M2 | Collapse and Solstice: F3, F5 | M1 | R13, R20, R29-R31 |
| M3 | Solo recipients: F4 | M2 timing contract | R21-R22, R28 |
| M4 | Scoring and Bot valuation: F6, F7 | M0; integrate after M3 | R14-R19, R23-R25 |
| M5 | Payments and keywords: F8-F11 | M1-M4 | R08-R12, R26, R32-R40 |
| M6 | Persistence, legal actions, and UI | Compatibility design starts at M0; finalize after M5 | New cross-layer tests |
| M7 | Broader fidelity validation | M1-M6 | Expanded corpus |
| M8 | Required gates, documentation, release | M7 | Full local and hosted gates |

M2 must ship as one coherent behavior change: fixing Collapse without recipient ordering can turn the existing ordering defect into an unavoidable incorrect ending. M6 is not deferred discovery; inspect persisted state before M1 and add compatibility work alongside every schema change.

## M0: Establish The Repair Baseline

Deliverables:

- Rerun `audit:rules`, engine tests, and typecheck; record exact commit, failures, and any changed baseline.
- Verify the audit's pinned rulebook version against the publisher resource page and applicable errata. Retain source identifiers/hashes and paraphrased rule contracts; keep source assets untracked.
- Build a resource/token vocabulary table connecting rulebook icons, engine keys, UI labels, and import aliases. In particular, distinguish Actions/Exhausts and `knowledge`/Progress/Goods.
- Enumerate affected mutation and predicate paths: moves, effect execution, cleanup, Bot resolution, legal-action selectors, save/resume, and displayed choices.
- Inventory save-library versions, full game snapshots, online room persistence, pending choices, and replay assumptions. Decide a rules-version policy before changing any persisted representation.

Exit: every finding has a source-backed expected result and identified ownership; disputed interpretations are isolated for clarification, not coded by guesswork.

## M1: Correct Token Lifecycle (F1, F2)

Primary surfaces: `engine/src/game/zones.ts`, `game/turn.ts`, `cards/effectRunner.ts`, progression predicates and selectors.

Implementation:

- Use the Exhaust pool for both Nation and Development progression; eliminate the duplicated Action-based availability decision.
- Preserve progression occupancy markers and the one-addition-per-cleanup constraint. Keep ordinary Actions separate.
- Make setup initialize pools and cleanup refresh them. Remove redundant ordinary turn-start refresh without breaking initial turns or explicit nation exceptions.
- Preserve Exhaust spending after cleanup draws and between turns. Verify token-return abilities do not accidentally erase progression occupancy.

Required tests: all combinations of zero/nonzero Actions and Exhausts; Nation and Development branches; empty decks; repeated draws; ordinary Draw versus Draw-if-able; cleanup draw followed by next-turn begin; opponent-turn reactive spending; first turn; explicit token modifiers; serialized resume at each boundary.

Exit: R01-R07 pass; a real turn sequence, not only a seeded state, demonstrates that cleanup-spent Exhausts stay spent until the next legal refresh. Move availability and displayed token counts agree.

## M2: Correct Terminal Timing And Solstice (F3, F5)

Primary surfaces: `game/unrest.ts`, `game/turn.ts`, scoring termination, effect continuations, all shared-Unrest removals.

Implementation:

- Enumerate all shared-pile removals, including acquisition, market operations, and Bot paths. Separate setup population from gameplay terminal checks.
- Trigger Collapse on the transition to an empty shared pile. Stop later text, recipients, draws, queued reactions, and continuations according to the terminal rule. Preserve the last legally completed mutation and make terminal finalization idempotent.
- Represent Solstice work by affected recipient while retaining source owner, source card, original ordering constraints, and continuation state. Do not blindly rewrite the effect's owner to the recipient, which could redirect costs or self-references.
- Let the recipient order applicable incoming and owned effects. Define how multi-recipient effects, choices, and source removal are resumed exactly once under the source rules.

Required tests: final Unrest through each removal path; multiple requested Unrest cards; final Unrest followed by gain/choice/draw; pending normal scoring; competing endings; both legal orders of incoming Unrest versus a return; three/four-player effects; source-owner references; interruption and save/resume at every Solstice stage; no duplicate resolution after retry/reconnect.

Exit: R13, R20, R29-R31 pass together; both Solstice orderings yield independently specified outcomes, including immediate Collapse where appropriate. No post-terminal state mutation is accepted.

## M3: Adapt Human Effects To Solo Recipients (F4)

Primary surfaces: `cards/effectRunner.ts`, Bot state/effect resolvers, target selection, reaction continuations.

Implementation:

- Inventory each scoped operator: self, other, all, and explicitly chosen targets. Classify Bot behavior as normal, adapted, ignored, or unsupported with a source reference.
- Reuse existing Bot operations for supported recipient effects. Keep the Bot distinct from `G.players` rather than inserting an incomplete human-shaped object.
- Implement imposed Bot draws as deck-to-discard movement without an unintended reshuffle or progression.
- Preserve correct source/target identities for resources, attacks, Unrest, triggers, logging, and terminal events. Explicitly surface unsupported imported operations instead of silently treating them as successful no-ops.

Required tests: human-to-Bot gain, loss, draw, and Unrest; self/others/all distinctions; empty Bot draw deck; multiple targets; synthetic attack/reaction examples; Collapse during Bot receipt; solo versus equivalent multiplayer controls; serialized continuations.

Exit: R21-R22 and R28 pass; every currently supported scoped operator has an explicit solo policy and focused evidence, not merely the two initially failing examples.

## M4: Correct Scoring And Selection Values (F6, F7)

Primary surfaces: `game/scoring.ts`, `solo/botMarket.ts`, setup/Dynasty ordering and duplicated VP helpers.

Implementation:

- Keep literal, fixed, conditional, and variable VP categories distinct; preserve negative and zero values without truthiness fallbacks.
- Apply the human variable-card ceiling independently of a larger formula cap. Preserve source-defined exceptions only where explicitly justified.
- Implement Bot-specific variable and conditional valuation consistently for scoring and selection, rather than reusing human evaluation indiscriminately.
- Rank market cards by the correct primary value, then total tokens, then slot. Only Progress contributes resource VP to the primary comparison.
- Consolidate valuation policies where final scoring, market choices, and setup currently disagree; retain context-specific differences.

Required tests: positive/zero/negative fixed values; conditional branches; variable values below/at/above the ceiling; smaller/larger formula caps; Bot variable and conditional treatment; mixed market resources; all tie-break levels; scoring zones and garrisons; excluded undeveloped cards and hosted resources; endgame aggregation.

Exit: R14-R19 and R23-R25 pass; a manually calculated synthetic endgame produces the expected human and Bot totals, and candidate ordering matches a separately specified table.

## M5: Correct Payable Choices And Keywords (F8-F11)

### M5a: Optional And Choose Payments (F8)

- Separate affordability from benefit resolvability in `cards/effectRunner.ts` and corresponding move predicates.
- Keep a payable cost branch when later benefit text cannot resolve; continue rejecting unaffordable costs and preserving the correct optional skip choice.
- Ensure cost payment happens once even with nested choices, substitutions, and interruptions.
- Test paid/no-benefit branches, partially resolvable benefits, nested optional/Choose effects, zero costs, substitutions, cancel/resume, and insufficient resources. Exit: R08-R12 pass and UI choice availability matches execution.

### M5b: Failed Break-through (F9)

- Correct human and Bot fallback to Progress, including event identities, logs, previews, and resource-supply accounting where supported.
- Preserve small-deck/Main-deck search order and successful-search behavior; reconcile fallback with any terminal event during the search.
- Test both actors, successful and failed searches, relevant suit/deck branches, empty sources, repeated effects, and reactive Progress gains. Exit: R26 and R32-R33 pass.

### M5c: Exile Acquisition (F10)

- Apply the Region exemption consistently in human and Bot acquisition paths, using established suit matching for multi-icon cards.
- Preserve actor-specific destination and gain order; integrate the shared-pile terminal rule from M2.
- Test Region, non-Region, Unrest, multi-icon cards, absent card, empty/final shared Unrest, and Bot destination order. Exit: R34-R35 plus Bot and Collapse integration cases pass.

### M5d: Trade (F11)

- Correct fallback to pay Progress and gain Goods. Correct opponent-route reward to Goods for both actors; retain Bot own-route rules.
- Update execution, affordability checks, legal options, pending-choice fields, labels, resource events, and continuation semantics together.
- Preserve route capacity, ownership, Commerce context, and Bot route-selection priorities. Do not accidentally charge the Bot for its own-route supply placement.
- Test no routes, one/multiple routes, full routes, both owners, zero resources, Commerce interruptions, expansion disabled, and saved pending choices. Exit: R36-R40 plus human own-route and resumed-choice tests pass.

## M6: Protect Saved Games And Validate User Workflows

Primary surfaces include `app/src/saveLibrary.ts`, `app/src/ui/setup/SavedGames.tsx`, board layout/selectors, and server room persistence.

Compatibility policy:

- Track rules semantics separately from save-container format if the existing version model cannot express both.
- Preserve an original recoverable snapshot before migration; do not overwrite named saves during inspection or failed conversion.
- Migrate representation-only changes when deterministic. Recompute a pending choice only when the stored context is sufficient to do so correctly.
- Never infer missing historical Action/Exhaust spending or retroactively claim a bug-affected game was played under corrected rules. For ambiguous states, provide a clear incompatibility explanation and preserve export/backup access; require an explicit user decision before a fresh corrected game.
- Apply compatible handling to local saves, imported snapshots, online rooms, and reconnecting clients. Do not assume a local-library migration also fixes server persistence.

User-level verification:

- Start fictional multiplayer and solo games; exhaust Actions while leaving Exhausts available; progress; cross cleanup and next-turn boundaries; verify counts and enabled controls.
- Exercise both Solstice orders, recipient choices, immediate Collapse, and blocked post-game input.
- Perform each Trade path, failed Break-through, Exile acquisition, and payable no-benefit choice; verify labels, resources, logs, and keyboard/controller selection.
- Save/resume during each changed pending choice; reload, reconnect, and repeat with two browser contexts. Assert no duplicated effects and no newly exposed hidden data.
- Inspect desktop/mobile screenshots for changed controls and run focused accessibility checks. This is behavior validation, not an unrelated redesign.

Exit: compatibility fixtures cover supported old/current versions and reject unsafe cases without data loss; browser-visible behavior matches the corrected engine.

## M7: Expand Validation Beyond The Original Probes

- Add independent expected-state scenarios for full turn cycles, endgame totals, all effect-operator families, supported player counts, solo difficulties, and supported variants. Prioritize interactions affected by the repairs.
- Use pairwise configuration coverage as a practical floor, plus explicitly targeted higher-order interactions such as Trade + solo + final Unrest and progression + cleanup + save/resume. State that this is not exhaustive combination coverage.
- Extend seeded stress runs with invariant checks: unique card placement, token accounting, nonnegative pools where required, no post-terminal mutation, pending-choice ownership, deterministic continuation, and hidden-state redaction.
- Preserve any failing seed, initial fixture, choices, and engine/rules version. Add minimized regressions for discovered defects.
- Verify save/resume equivalence against uninterrupted runs under the same rules version. Determinism alone is not correctness, so include manually derived expected outcomes rather than only comparing two engine runs.
- Build an explicit coverage inventory for nation hooks, Bot-table operator families, setup, and card errata. Generic synthetic mechanism coverage must not be described as certification of uninspected official rows.

Exit: the expanded public corpus passes, every discovered defect is resolved or explicitly prevents the affected readiness claim, and remaining unaudited domains are named in the final report.

## M8: Make Correctness A Required Release Gate

The current `verify:pre-private` command does not directly run the complete engine or independent audit suites. Correctness gates must explicitly include them rather than relying on indirect smoke coverage.

Implementation:

- Keep `audit:rules` runnable and make it required in the normal verification/release path once repaired. Ensure CI, if introduced or present elsewhere, invokes the same gate; no top-level `.github` directory was found during planning.
- Update rules notes, parity matrix, coverage map, and README with source-backed claims. Preserve the original audit as a dated historical record and add a closure report with current evidence.
- Run release-script tests, full typecheck, engine/app/server tests, fidelity audit, stress, fictional and multiplayer smoke, local browser QA, production-local verification, and relevant asset budgets. Add script tests proving the new fidelity gate cannot be skipped by the normal release workflow.
- After explicit release authorization, commit only the scoped changes, push the verified commit, and use the existing Render release tooling. Set `POLITY_EXPECTED_COMMIT` to the full deployed SHA for hosted proof and verify the intended origin.
- Run hosted smoke and hosted two-context browser QA, then manually exercise a representative repaired workflow. Record local versus hosted results separately.
- Prepare rollback with a known-good application revision and compatible storage snapshot. Do not assume rolling back code can read newly migrated saves; avoid destructive storage changes and preserve originals.

Exit: local gates pass, hosted identity matches the intended commit, repaired user workflows pass, and the closure report distinguishes known-gap closure from broader unaudited content. Failed release checks stop rollout rather than weakening the fidelity gate.

## Completion Checklist

- [x] M0: source and baseline ledger established.
- [x] M1: Action/Exhaust progression and refresh semantics repaired.
- [x] M2: Collapse and recipient Solstice order repaired together.
- [x] M3: scoped effects have tested solo recipient policies.
- [x] M4: scoring and Bot valuation agree with source-backed examples.
- [x] M5: optional payments, Break-through, Exile, and Trade repaired.
- [x] M6: saved games and user-visible flows handled without silent data loss.
- [x] M7: expanded synthetic fidelity corpus and documented limits complete.
- [x] M8: required gates and documentation complete; release only when authorized.

The first implementation goal should be M0-M2, ending with verified token lifecycle and terminal/Solstice behavior. Follow with M3-M5, then M6-M8. Keep milestone evidence separate even if one later authorized goal spans the entire plan.
