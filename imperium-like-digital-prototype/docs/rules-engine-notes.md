# Rules Engine Notes — Imperium: Horizons-Inspired Digital Prototype

> **Purpose:** implementation-oriented notes distilled from the uploaded rulebook for a private, rules-engine prototype. These notes summarize mechanics and data structures and do not reproduce official card text, art, logos, faction names, or rulebook language.
>
> **Boundary:** keep the official rulebook PDF and any official card transcription outside the public repo. Put them in a gitignored `reference/` folder. Use these notes to design a generic, data-driven engine; use placeholder/original cards in committed test data.

## Core modeling direction
- Turn-based asymmetric deck-building civilization engine.
- Shared market with multiple source decks.
- State-gated card play.
- Separate per-turn action/exhaust token economies.
- Persistent in-play cards with attachments.
- Zone-based progression (history/garrison/exile) and endgame handling.

## Typed vocabulary to keep stable in code
- `Suit`: region / uncivilised / civilised / tributary / fame / unrest / trade_route / merchant / power / gadget / nation_specific.
- `CivState`: barbarian / empire / custom_1 / custom_2.
- `ZoneName`: hand / drawDeck / discard / playArea / history / nationDeck / developmentArea / garrison / exile / market / unrestPile / fameDeck / mainDeck / regionDeck / uncivilisedDeck / civilisedDeck / removedFromGame.
- `Resource`: materials / population / progress / goods.

## State shape priorities
- Zones should store `CardID[]`, with `cardDb` holding definitions.
- Track `actionTokens`, `exhaustTokens`, `handSize`, and per-turn constraints.
- Track card-instance attachments separately from card definitions (resources, garrisoned cards, counters, exhaust markers).
- Keep market/deck/exile/unrest/fame/gameEnd/log state in `GameState`.

## Setup pipeline (deterministic)
`setupGame(config)` should flow through:
1. Build players from civilization modules.
2. Configure power/state/nation/development/start decks.
3. Build commons from enabled sets and player-count filters.
4. Seed/refill market to five slots.
5. Place unrest under eligible market cards.
6. Set first player and round/solstice pointers.

## Turn model
- Turn type enum: `activate | innovate | revolt`.
- Activate supports play/exhaust/profit/end-turn style moves.
- Innovate/Revolt are specialized turns that skip normal action/exhaust sequencing.
- Cleanup is a fixed sequence: market cleanup resource → token reset → optional discards → draw-up.

## Draw/reshuffle rules service
Centralize in a draw service:
- Normal draw may trigger reshuffle progression checks.
- Draw-if-able must not trigger reshuffle.
- Reshuffle progression can add nation/development cards and handle accession/state flip via hooks.

## Effect DSL direction
- Sentence-oriented resolver with ordered effects and optional/choice groups.
- Costs resolve before benefits.
- Triggered responses fire between sentences.
- Keep op names data-driven and explicit for zone/resource/market/token/state behavior.

## Expansion and solo strategy
- Keep Trade Routes behind feature flags.
- Keep solo bot as a separate controller with table-driven resolution rows.
- Defer full variant matrix until core multiplayer shell is stable.

## High-risk implementation areas
1. Reshuffle progression timing.
2. Market refill source-deck logic.
3. Acquire vs break-through behavior.
4. Garrison host-movement rules.
5. Once-per-turn free-play tracking.
6. Passive timing in non-activate phases.
7. Collapse interruption handling.
8. Expansion timing exceptions.
9. Civilization-specific hooks.
10. Zone-sensitive scoring logic.

## Milestones
- **M1:** minimal playable shell (2-player, market, draw/play/cleanup, placeholder cards/tests).
- **M2:** progression model (nation/development/state flip, garrison/history, acquire/break-through).
- **M3:** solstice + endgame skeleton + broader keyword coverage.
- **M4:** civilization hooks, expansion module, and solo bot.
