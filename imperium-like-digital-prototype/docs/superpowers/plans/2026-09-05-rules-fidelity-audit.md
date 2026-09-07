# Independent Rules Fidelity Audit

Date: 2026-09-05. Runtime baseline: `ef60fb49430e000fb5288d8c5b8e33150a8fbae8`.

## Verdict

**Not validated as faithful to the published rules.** Forty targeted public-safe checks produced 25 failures and 15 passes, grouped into 11 rule-contract defects. These are deliberately selected edge cases, not a random sample or a fidelity percentage. A complete game, nation, card, variant, or solo-table certification has not been performed.

The existing engine suite still passes all 1,540 tests across 52 files. Several tests encode the same interpretation errors as the implementation, so passing that suite cannot establish rules fidelity. Operational readiness and deployment verification remain separate from rules correctness.

## Sources And Method

- Authority: [Horizons rulebook currently linked by Osprey](https://www.ospreypublishing.com/media/1kmpbipw/imperium-horizons-rulebook.pdf), selected from the publisher's [board/card game resources page](https://www.ospreypublishing.com/us/discover/gaming-resources/board-card-games/). Page references below use printed page numbers.
- Retrieved 2026-09-05: 52 pages, 18,799,803 bytes. SHA-256: `42D84C877195B77C8BB71DF12D1C3D6E690ADBE47EB3C38BCE28D4888CA36520`.
- An older search-indexed PDF was initially inspected, then findings were checked against the currently linked revision. Text extraction was supplemented with rendered-page inspection to distinguish Action, Exhaust, Progress, Goods, Region, Unrest, and VP icons. The currently linked edition is the baseline, not local notes.
- Publisher-linked April 2024 large/small card errata were located but not exhaustively checked against card data. No private card data was imported or transcribed for this audit.
- Synthetic fixtures explicitly set `usePrivateData: false`, clear nation overrides, and use controlled cards/resources. Code key `knowledge` represents Progress. Existing regression-suite private-import tests use their own test fixtures; they are not a validation of a user's private collection.
- Downloaded PDFs, page renders, and machine-readable output remain local audit evidence, not distributable repository assets.

## Reproduce

From `imperium-like-digital-prototype`:

```powershell
npm.cmd test -w engine
npm.cmd run typecheck -w engine
npm.cmd run audit:rules
```

The audit is `engine/src/audits/rulesFidelity.audit.ts`, selected by `engine/vitest.audit.config.ts`. It uses ordinary assertions, not skipped or expected-failure tests. It deliberately runs separately from the historical regression suite and currently exits 1. A green default test command does not include this fidelity gate. Do not label a release rules-faithful until the audit passes and the stated scope limitations are addressed.

## Confirmed Findings

### F1 / P1: Progression spends the wrong token

Evidence: pp. 6, 15-16; R01-R03. `engine/src/game/zones.ts:46` checks Actions and line 55 spends an Action; `engine/src/cards/effectRunner.ts:958` duplicates the availability predicate. The independent checks observe progression blocked at zero Actions despite an available Exhaust, permitted at zero Exhausts, and pools changing from `[3 Actions, 5 Exhausts]` to `[2, 5]` instead of `[3, 4]`.

Repair acceptance: use the Exhaust pool consistently for Nation/Development progression, while retaining the one-addition-per-cleanup restriction; reconcile existing progression tests and legal-action predicates.

### F2 / P1: Turn start restores tokens already spent between turns

Evidence: p. 15 cleanup and p. 16 reshuffling; R04. `engine/src/game/turn.ts:529` unconditionally resets availability on turn begin. A valid post-cleanup state with an Exhaust spent on progression is restored from 4 to 5. Cleanup already refreshes tokens; a second refresh erases later spending.

Repair acceptance: preserve post-cleanup/inter-turn spending at turn start, including reactions and progression. R04 seeds the valid rule-state directly; it is not a full multiplayer reaction-flow test.

### F3 / P1: Collapse occurs too late

Evidence: p. 17; R30-R31. `engine/src/game/unrest.ts:90` and its surrounding take path check failure to obtain an Unrest card, not the successful removal of the last card. Taking the final card leaves the game running, and a subsequent effect grants 3 Progress.

Repair acceptance: trigger Collapse when the pile becomes empty and stop subsequent effect text. Inspect every path that removes shared Unrest, not only this tested effect operation.

### F4 / P1: Human effects targeting other players omit the solo Bot

Evidence: p. 30; R21-R22, with passing multiplayer control R28. `engine/src/cards/effectRunner.ts:36` derives recipients only from `G.players`, while the Bot is stored separately. Other-player resource gains do not reach the Bot, and an imposed draw does not move a Bot deck card to its discard.

Repair acceptance: introduce consistent Bot recipient adaptation for human effects, including the special imposed-draw behavior. Simply treating the Bot as an ordinary human player would not implement its rules.

### F5 / P1: Incoming Solstice effects cannot join the recipient's ordering choice

Evidence: p. 16; R13 and passing explicit-order control R29. `engine/src/game/turn.ts:368` collects the current owner's cards and executes their scoped effects before proceeding to the next player. The recipient is not offered an order between incoming Unrest and their own Unrest return.

Observed trace: incoming Unrest resolves first, then the recipient returns a card. This run does not demonstrate premature Collapse, because F3 masks that outcome. Correcting F3 alone makes the missing ordering choice especially consequential.

Repair acceptance: collect applicable effects by recipient, preserve ownership/context, and let each recipient order their effects with incoming ones. Test interacting Unrest, resource, and interruption cases.

### F6 / P1: Scoring caps the wrong VP categories

Evidence: pp. 17, 31; R14-R17 and R23. `engine/src/game/scoring.ts:162` applies its positive cap to literal/fixed/conditional values, reducing a synthetic 14-point card to 10 for humans and the Bot. Conversely, the formula cap at line 109 allows a variable card with `cap: 20` to score 20.

Repair acceptance: distinguish fixed, conditional, and variable scoring rules; enforce the human variable-card ceiling independently of larger formula metadata; retain Bot-specific valuation. Audit duplicate valuation code used for setup and market choices. Synthetic values expose the contract defect; no claim is made that a particular private card currently hits each case.

### F7 / P2: Bot market choices count all resources as VP

Evidence: p. 31; R24, with passing tie-break control R25. `engine/src/solo/botMarket.ts:56` adds all market tokens to the candidate's primary VP value. A zero-VP card carrying 10 Materials beats a 3-VP card, though non-Progress resources should affect only the later token-count tie-break.

Repair acceptance: separate primary card-plus-Progress value from total-token and slot tie-breakers; apply the comparator consistently to relevant Bot choices.

### F8 / P2: Payable optional/Choose branches are removed when the benefit cannot resolve

Evidence: p. 14 cost rule and p. 39 Pay; R08-R09, with unaffordable-cost control R10. `engine/src/cards/effectRunner.ts:1359` filters explicit spending out before asking whether a branch has resolvable text. An affordable payment followed by an impossible Draw-if-able is removed, leaving only skip or automatically selecting the other branch.

Repair acceptance: preserve legal payable-cost choices even when their benefit cannot resolve; continue rejecting genuinely unaffordable costs. Update existing assertions that enforce the incorrect filtering rule.

### F9 / P2: Failed Break-through grants Materials instead of Progress

Evidence: pp. 31, 36; R32-R33. `engine/src/game/breakThrough.ts:63` and `engine/src/solo/botMarket.ts:276` award Materials. Both controlled failed-search cases produce `[0 Progress, 2 Materials]` instead of `[2, 0]`.

Repair acceptance: correct human and Bot fallback resources, including logs, UI descriptions, and reactive gain events. Preserve source-deck search ordering, checked separately by R26.

### F10 / P2: Exile acquisition exempts Unrest instead of Region

Evidence: p. 36; R34-R35. `engine/src/game/exile.ts:26` uses `!isUnrestCard` to decide whether to add Unrest. The probes show a Region acquisition receiving an unwanted Unrest card and an Unrest acquisition missing its extra Unrest.

Repair acceptance: use the Region exemption and inspect the analogous Bot acquisition logic, pile exhaustion, and destination ordering. The current direct probes cover the human Exile path.

### F11 / P1: Trade resource conversion and opponent-route rewards are wrong

Evidence: pp. 31, 39, visually checked against both resource icons; R36-R39, with own-route Bot control R40. Human Trade in `engine/src/cards/effectRunner.ts:397` and its `trade` operation converts Goods into Progress, reversing the rule. `engine/src/solo/botTradeRoutesResolver.ts:197` repeats the reversal. Both paths also grant Progress instead of Goods when trading with an opponent's route.

Repair acceptance: correct fallback conversion and opponent rewards for human and Bot paths; update option availability, UI labels, pending-choice schema names, resource events, and old tests. Separately test resuming older saves if the persisted pending-choice representation changes.

## Passing Controls And Limits

The 15 passing controls cover cleanup refresh, Draw-if-able avoiding progression, one progression addition before cleanup, unaffordable optional payment, Progress payment substitution, no Goods substitution for a Progress cost, ordinary variable scoring, selected scoring-zone boundaries, explicit Collapse precedence, Bot tie-breaks, small-deck search precedence, History identity privacy, multiplayer other-player resource gain, explicit safe Solstice ordering, and Bot own-route Goods placement.

These controls are narrow. They do not certify all payment/undo/reaction paths, hidden-information behavior, multiplayer turns, complete setup, endgame variants, nation exceptions, campaigns, every effect operator, every bot-table row, or official card errata. No browser walkthrough or hosted deployment verification was performed as part of this engine audit.

## Repair Order And Exit Gate

1. Correct token lifecycle, terminal Collapse, and recipient-based Solstice together; add chained/inter-turn integration tests.
2. Correct scoring and solo recipient/valuation adapters; compare human and Bot outcomes using source-backed fixtures.
3. Correct Trade, Break-through, Exile, and payable choices; reconcile legal actions and UI wording with the same contracts.
4. Correct contradictory notes and historical assertions. Promote repaired fidelity cases into required CI/release gates without marking unresolved assertions as expected failures.
5. Expand into complete seeded games, variant combinations, and source-backed nation/bot-table samples. Check private data only as a separate, explicitly scoped later gate.

Exit criteria: all fidelity probes and existing regression/type checks pass, repaired behavior is independently traced to the current sources, and remaining unaudited areas are stated rather than presented as certified. This audit added tests, a command, and documentation only. It did not fix runtime code, commit, push, or deploy.
