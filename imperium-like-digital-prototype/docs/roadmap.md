# Roadmap

## Milestone 1
- Core state model
- Placeholder cards and civilization data
- Basic play/acquire/end-turn loop
- Vitest coverage for key engine flows

## Milestone 2
- Better effect DSL: baseline implemented with broad import/runtime validation; continue adding public-safe reproductions when private data reveals new shapes
- Choice resolution (`choose_one`) and pending-choice resume flows are implemented with regression coverage
- Reshuffle progression: ordered Nation deck top-card progression, payable Development choice, and state/accession hooks are implemented and covered; continue parity review with focused regressions when new rulebook edge cases are identified
- Hidden-info selectors for Nation, Development, decks, bot decks, public piles, owner-only choices, and spectator views are implemented with regression coverage
- Undo support: baseline guardrails exist; continue edge-case polish through public-safe tests
- Validation/legal move checks: baseline exists; continue tightening action availability and blocked-reason clarity

## Milestone 3
- Full keyword coverage for Acquire vs Break through, payment substitution, garrison, recall, abandon, history, and exile: broad runtime coverage exists; next step is auditable scenario-level coverage.
- Solstice, scoring, collapse, and Fame deck edge cases: broad unit coverage exists; continue scenario expansion and playtest-driven regression capture.
- Solo bot shell: implemented with Bot table import/runtime coverage; continue fallback/payment and human-choice scenario coverage.
- Steam Deck UI improvements: partially covered by layout work; still needs dedicated human playtest and controller-oriented polish.
- Save/load support: baseline local save/resume/export/import exists; still needs multi-slot metadata, migration handling, and hidden-info scrub checks.
- Hosted release proof and private-data validation remain final product-readiness gates.
