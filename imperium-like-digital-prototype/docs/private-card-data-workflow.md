# Private card data workflow

Private card and nation data stays local and gitignored.

## Why separated
- Protect private transcriptions and official/proprietary text.
- Keep public repo limited to schemas, validators, and tooling.

## Card data workflow
1. Copy `private-card-data/card-data-template.csv` to a local private CSV (for example `private-card-data/imperium_cards_private.csv`).
2. Enter private fields locally (`card_name_private`, `raw_effect_text_private`) and keep `public_placeholder_name` safe for demos.
3. Validate:
   - `npm run cards:validate -- --input private-card-data/imperium_cards_private.csv`
4. Import:
   - `npm run cards:import -- --input private-card-data/imperium_cards_private.csv --output generated-private/cards.normalized.json --report generated-private/card-import-report.json`

## Nation data workflow
- Cards and nations are separate private files.
- Cards define behavior units.
- Nations define starting state + rule modifiers.
- Card lists are pipe-delimited.
- `special_setup_json` and `passive_rules_json` are JSON arrays.

Validate/import nations:
- `npm run nations:validate -- --cards generated-private/cards.normalized.json --input private-card-data/imperium_nations_private.csv`
- `npm run nations:import -- --cards generated-private/cards.normalized.json --input private-card-data/imperium_nations_private.csv --output generated-private/nations.normalized.json --report generated-private/nation-import-report.json`

Combined:
- `npm run private:import-all`

## Safety and legal boundary
- Private official names/text must stay local.
- Use `public_placeholder_name` for screenshots/demos.
- `generated-private/` and `reference/` are gitignored to avoid accidental leaks.

## Suggested incremental workflow
1. Enter 10–15 simple cards.
2. Implement `effect_ops_json` for those cards.
3. Write tests.
4. Add one simple placeholder nation.
5. Expand gradually.
