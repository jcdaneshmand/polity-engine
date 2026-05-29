# Commons Setup Architecture

The Commons setup subsystem determines the public Commons card pool entirely from normalized card metadata. Committed data must use fake placeholder Commons cards only; any private import that maps to real card identities remains local and gitignored.

## Commons set selection

Each normalized card declares `ownership`. Commons setup starts by excluding every card whose ownership is not `commons`, then selects cards whose `commonsSetId` matches the requested set: `classics`, `legends`, `horizons`, or `custom`. Replacement cards are not part of the normal selected Commons set; they are considered only by the replacement policy.

## Player-count filtering

Cards can declare `playerCountRequirement` as `1+`, `2+`, `3+`, or `4+`. Commons setup compares this requirement to `effectiveCommonsPlayerCount`:

- `4+` cards appear only at effective count 4.
- `3+` cards appear at effective count 3 or 4.
- `2+` cards appear at effective count 2, 3, or 4.
- Omitted requirements are treated as eligible.

## Solo/practice effective 2-player Commons setup

Solo and practice games have `playerCount: 1`, but their Commons pool is built with `effectiveCommonsPlayerCount: 2`. The setup pipeline computes that effective count after player and nation setup and passes it to `buildCommonsSetup`.

## Trade Routes Commons filtering

Expansion metadata controls Trade Routes selection:

- `requiredExpansions` must all be enabled.
- `excludedExpansions` must not be enabled.
- `commonsGroup: "trade_routes"` cards are excluded when `trade_routes` is disabled.
- When `trade_routes` is enabled with Horizons Commons, cards tagged as metadata-driven Trade Routes alternates are excluded unless they are marked `trade_friendly` or `trade_routes`.

This allows placeholder public data and private real-card data to use the same rules without hard-coded card names.

## Lowered Aggression delayed cards

When `lowered_aggression` is enabled, Commons deck construction sets aside cards with `delayableInLoweredAggression` or cards with `cardType: "attack"` and the `aggressive` tag. These delayed cards are not eligible for initial market construction. After the initial market is built, they are shuffled into the main deck.

## Quick Setup alternate deck construction

When `quick_setup` is enabled, setup skips suit-separated small deck construction and builds a combined market deck from eligible Commons cards. All selection, expansion, player-count, nation-conflict, and replacement filters still run before this alternate construction path.

## Replacement policy

`replacementPolicy` controls whether removed cards can be substituted:

- `none`: remove conflicting cards without substitution.
- `use_replacements`: use the first eligible replacement card.
- `prefer_latest`: sort eligible replacements by set freshness before choosing.

Replacement candidates can be cards with `ownership: "replacement"`, `commonsGroup: "replacement"`, a matching `replacementForCardId`, or a matching `replacementGroupId`. Candidates must also pass player-count, expansion, and nation-conflict filters.

## Nation-name conflicts

Cards can declare `conflictsWithNationIds`. After normal Commons selection, setup removes any Commons card that conflicts with a selected nation. If the replacement policy allows substitutions, setup tries to find an eligible replacement from another Commons set or replacement group.

## Why setup is metadata-driven

The engine cannot commit official card names or text. A metadata-driven design lets public placeholder cards, local private card imports, variants, expansions, and nation-specific exceptions all use the same setup code. This keeps legal/public data safe while still allowing accurate local setup for users who import private data.
