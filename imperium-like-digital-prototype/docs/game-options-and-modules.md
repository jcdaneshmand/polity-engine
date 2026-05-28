# Game options and modules

This prototype uses a data-driven options/module system.

- **ExpansionId**: major content module toggles (currently `trade_routes`).
- **VariantId**: setup/rules variants (`lowered_aggression`, `quick_setup`, `precious_cards`, `short_game`).
- **GameMode**: runtime mode (`multiplayer`, `solo`, `practice`).
- **SoloDifficulty**: bot tuning config for solo mode.

Cards and nations can declare required/excluded expansions and allowed/disallowed modes. Setup validates and filters accordingly.

Hooks are applied through module registry, not hard-coded nation/variant branches.

All official/private content remains outside this public repo. Only placeholder data and tooling are committed.
