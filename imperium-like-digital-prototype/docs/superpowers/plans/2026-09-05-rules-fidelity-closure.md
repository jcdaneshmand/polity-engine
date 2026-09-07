# Rules Fidelity Repair Closure

Status: complete for the authorized public-safe local scope. No private data was used and no deployment was performed.

## Scope And Source

This closure addresses the 11 public-engine findings in the dated independent audit. The rule authority used for those contracts was the current public Imperium: Horizons rulebook inspected during the audit, retained only in ignored temporary storage. Its SHA-256 was `42D84C877195B77C8BB71DF12D1C3D6E690ADBE47EB3C38BCE28D4888CA36520`.

This is known-gap closure and public synthetic engine validation. It is not card-by-card, nation-by-nation, Bot-table, errata, or private-dataset certification.

## Contract Ledger

| Finding | Corrected contract | Primary implementation | Direct evidence |
| --- | --- | --- | --- |
| F1 | Progression spends Exhaust, never Action | `game/zones.ts`, `cards/effectRunner.ts` | R01-R03, R07; progression tests |
| F2 | Cleanup refreshes tokens; ordinary turn start preserves later spending | `game/turn.ts` | R04-R05; turn-loop and progression tests |
| F3 | Collapse fires when the final shared Unrest is taken and stops later text | `game/unrest.ts`, Exile/Bot paths | R20, R30-R31; effect, turn-loop, Exile, and Bot tests |
| F4 | Scoped gains include the Bot; imposed Bot draws discard from its deck without reshuffling | `cards/effectRunner.ts` | R21-R22, R28, R41-R42 |
| F5 | Each Solstice recipient orders owned and incoming applicable effects | `game/turn.ts`, pending continuation state | R13, R29; ordered, shortage, interruption, and resume tests |
| F6 | Only variable human card VP is capped at ten; literal/fixed/conditional VP is preserved | `game/scoring.ts` | R14-R19, R23; scoring tests |
| F7 | Bot market primary value adds only Progress; all tokens remain a later tie-break | `solo/botMarket.ts` | R24-R25; solo selection tests |
| F8 | An affordable optional/Choose payment remains legal even if later benefit text cannot resolve | `cards/effectRunner.ts` | R08-R12; effect-runner tests |
| F9 | Failed human and Bot Break-through grants two Progress and emits the matching event identity | `game/breakThrough.ts`, `solo/botMarket.ts`, continuations | R26, R32-R33; reactive continuation tests |
| F10 | Exiled Regions avoid the extra Unrest; other cards do not | `game/exile.ts`, `solo/botMarket.ts` | R34-R35; human/Bot and final-pile tests |
| F11 | Trade pays Progress for Goods and an opponent route rewards the trader with Goods | human/Bot Trade resolvers, predicates, pending state, UI | R36-R40; Trade module and UI tests |

## Vocabulary And Ownership

| Published concept | Runtime key | UI term | Import aliases or notes |
| --- | --- | --- | --- |
| Action | `actionTokensAvailable`, `actionsRemaining` | Action | State-card action pool |
| Exhaust | `exhaustTokensAvailable` | Exhaust | Also pays reshuffle progression |
| Progress | `knowledge` | Progress | Historical runtime key retained for save/data compatibility |
| Goods | `goods` | Goods | Trade output and route token |
| Materials | `materials` | Materials | May be substituted by Progress under normal payment rules |

The solo Bot remains separate from `G.players`. Supported human-to-Bot scoped adapters are resource gain and imposed deck draw. Scoped Steal, Take Unrest, Recall/Abandon Region, voluntary draw, and non-deck draw do not yet have a safe Bot representation; direct execution now records `SoloRecipientUnsupported(...)` instead of silently claiming success.

## Persistence Policy

New local saves carry `rulesVersion: 2`. Unversioned and older saves are refused with a specific corrected-rules incompatibility message and their source bytes are not rewritten. Version-compatible legacy Trade pending choices retain deterministic support for the old field name. Save-library revisions, private-data fingerprints, stale-tab protection, and authoritative snapshot recovery remain separate safeguards.

Persisted online matches created by an older deployment are not migrated because prior Action/Exhaust history cannot be reconstructed. They must be completed on the old revision or restarted under the corrected engine before a release switches code. This repair does not modify production storage.

## Validation Evidence

- Independent source-backed audit: 42/42 passed.
- Historical engine regression suite: 1,540/1,540 passed across 52 files.
- App suite: 223/223 passed across 22 files.
- Release automation suite: 16/16 passed, including proof that deployment invokes `verify:rules`.
- Engine, app, and server typechecks passed.
- Seeded gameplay stress includes serialized checkpoints, public fixtures, invariant checks, and a complete practice game with a nontrivial Unrest supply.
- `npm.cmd run test:stress`: 17/17 passed across the dedicated gameplay-stress and fictional-scenario files.
- `npm.cmd run verify:improvements`: passed end to end, including rules, release, QA-script, typecheck, app/server, fictional smoke, multiplayer restart/reconnect smoke, local browser QA, and asset-budget stages.
- `npm.cmd run verify:production-local`: passed, including Render build shape and the public-safe production operations rehearsal.
- Local browser QA passed automated practice, solo, two-seat self-play, a seven-step worked turn, save/resume, invalid-save recovery, and desktop, Steam Deck, tablet, and phone viewports.
- Initial app bundle budget passed at 942,964 bytes raw and 240,157 bytes gzip against limits of 980,000 and 250,000.

`private:status` remained non-failingly blocked because all six ignored private CSVs are header-only, as expected for this no-private-data goal. Hosted verification and deployment remain unperformed; they require separate authorization and an exact deployed commit through `POLITY_EXPECTED_COMMIT`.

## Remaining Limits

- The public suite uses synthetic and placeholder data. It does not validate unentered private card, nation, or Bot-table rows.
- Pairwise and targeted interactions are broad but not exhaustive across every expansion, variant, player count, and interruption ordering.
- Unsupported solo recipient operator families remain explicit backlog rather than inferred behavior.
- Physical controller behavior and hosted persistence upgrades require separate environment-level checks.

## 2026-09-06 Scope Qualification

The word "complete" above applies only to the 11 finding groups reproduced by the 2026-09-05 audit. It must not be read as certification of all public solo interactions, every interruption ordering, save-version recovery, or executable scenario coverage.

In particular, R42 proves that an unsupported solo operation is surfaced in the log; it does not prove the operation follows a solo rule. The resource-gain and imposed deck-draw adapters remain the only human-to-Bot recipient families currently classified as implemented and directly tested. Steal, Take Unrest, Recall/Abandon Region, voluntary draw, and non-deck draw remain open pending source-backed adaptation and behavioral tests.

Likewise, entries in `data/fictional-regression/scenarios.json` marked `planned_runtime_expansion` are plans, not executed scenarios. `fictionalScenarioSmoke.test.ts` currently executes a smaller set of smoke actions and checks scenario taxonomy; it does not run every listed scenario from setup to its asserted outcome. The 2026-09-06 improvement ledger in `docs/rules-engine-parity-matrix.md` supersedes broader readiness inferences while preserving this report's historical command evidence.

## 2026-09-06 G1 Addendum

The later G1 solo-interaction pass supersedes the open Bot-recipient list in the qualification above. Publisher-backed policies and behavioral tests now cover Steal, Take Unrest, Recall/Abandon Region, permitted and non-deck Draw wording, mixed recipients, and ignored Return Unrest. R42 now asserts actual Bot Unrest routing instead of unsupported logging. This addendum does not broaden the original closure into card-by-card certification, and the fictional-scenario limitation remains open for G4.
