# Nation Ruleset Architecture

This project separates **NationDefinition** (starting cards/zones/resources) from **NationRuleset** (rule-modifier plugin behavior).

- Cards are behavior units.
- Nations are starting-state bundles.
- Rulesets are reusable, typed rule-modifier plugins.
- Strategy profiles provide safe public summaries plus optional private local notes.

The engine supports typed override categories for setup, zone, state, reshuffle, cleanup, solstice, scoring, collapse, bot setup, and short-game behavior.

All committed examples are placeholders. Official/private source material must remain in local gitignored files.
