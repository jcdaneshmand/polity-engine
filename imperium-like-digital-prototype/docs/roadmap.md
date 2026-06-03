# Roadmap

## Milestone 1
- Core state model
- Placeholder cards and civilization data
- Basic play/acquire/end-turn loop
- Vitest coverage for key engine flows

## Milestone 2
- Better effect DSL
- Choice resolution (`choose_one`)
- Reshuffle progression: ordered Nation deck top-card progression, payable Development choice, and state/accession hooks are implemented and covered; continue parity review with focused regressions when new rulebook edge cases are identified
- Hidden-info selectors for Nation, Development, decks, bot decks, and public piles
- Undo support
- Validation/legal move checks

## Milestone 3
- Full keyword coverage for Acquire vs Break through, payment substitution, garrison, recall, abandon, history, and exile
- Solstice, scoring, collapse, and Fame deck edge cases
- Solo bot shell
- Steam Deck UI improvements
- Save/load support
