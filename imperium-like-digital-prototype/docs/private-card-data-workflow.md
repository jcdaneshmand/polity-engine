# Private card data workflow

Private card and nation data stays local and gitignored.

## Why separated
- Protect private transcriptions and official/proprietary text.
- Keep public repo limited to schemas, validators, and tooling.

## Card data workflow
1. Run `npm run private:status` whenever you want a non-failing public-safe snapshot of the local private workspace. It reports filenames, row counts, check statuses, and the next action without copying private row contents. If required ignored files are missing, run `npm run private:scaffold` to create local CSV work files from the committed template headers, or manually copy `private-card-data/card-data-template.csv` to `private-card-data/imperium_cards_private.csv`. Header-only files are just workspaces; `private:preflight` requires at least one data row in each required private CSV and rejects headers that drift from the committed templates before import.
2. Enter private fields locally (`card_name_private`, `raw_effect_text_private`) and keep `public_placeholder_name` safe for demos.
3. Validate:
   - `npm run cards:validate -- --input private-card-data/imperium_cards_private.csv`
4. Import:
   - `npm run cards:import -- --input private-card-data/imperium_cards_private.csv --output generated-private/cards.normalized.json --report generated-private/card-import-report.json`

## Keyboard transcription desk

For physical card entry, use the app's keyboard-first transcription desk:

```sh
npm run dev
```

Open the app and choose **Private Data**.

The desk can open `private-card-data/imperium_cards_private.csv` in browsers that support the File System Access API. When direct save is unavailable, it downloads a replacement CSV that uses the existing header from `private-card-data/card-data-template.csv`.

Recommended flow:

1. Choose a Commons batch profile and enter Commons cards first.
2. Use `Ctrl+Enter` to save the current card and move to the next blank card.
3. Use `Ctrl+D` to duplicate safe structure from the previous card without copying private text.
4. Use `Ctrl+Shift+D` only when intentionally copying private text for a variant or near-duplicate.
5. Leave `effect_ops_json` blank during the identity/raw-text pass unless the effect is already obvious.
6. Run `npm run cards:validate -- --input private-card-data/imperium_cards_private.csv` after each batch.

Nation deck entry can happen in any nation order. Choose the Nation Deck batch, enter the nation ID, and use that nation ID as `set_or_nation`.

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
- `npm run private:gate`

For diagnosis, `private:status` is the friendly progress check and `private:gate` is the strict proof. The status/preflight JSON reports include public-safe `recommendedCommands` and `nextStep` fields alongside filenames, output paths, row counts, and check statuses. `private:completeness` also calls out scaffolded header-only CSV files before rows exist so the local workspace does not look like an unexplained `0/0 complete` report. `private:gate` is equivalent to the public-safe preflight report, `private:import-all` (which includes `private:completeness`), and generated-artifact freshness verification. It fails fast before import if any required ignored private CSV is missing, header-only, or out of sync with its committed template header.

## CSV and JSON schemas
The setup screen accepts either generated normalized JSON or raw private CSV files. Keep official names/text in local-only files and use public placeholder fields for screenshots, demos, or shared reports.

Supported uploads:
- Cards: `cards.normalized.json` or a card CSV copied from `private-card-data/card-data-template.csv`.
- Nations: `nations.normalized.json` or a nation CSV copied from `private-card-data/nation-data-template.csv`.
- Nation rulesets: `nation-rulesets.normalized.json` or a ruleset CSV copied from `private-card-data/nation-ruleset-template.csv`.
- Nation strategy: `nation-strategy.normalized.json` or a strategy CSV copied from `private-card-data/nation-strategy-template.csv`.
- Bot state tables: `bot-state-tables.normalized.json` or a bot table CSV copied from `private-card-data/bot-state-table-template.csv`.
- Bot trade route tables: `bot-trade-routes-tables.normalized.json` or a trade route table CSV copied from `private-card-data/bot-trade-routes-table-template.csv`.

CSV schemas are the header rows in the committed template files under `private-card-data/`. JSON uploads use the normalized records emitted by the import commands above; wrapper objects are also accepted for matching roles, such as `{ "cards": [...] }`, `{ "nations": [...] }`, `{ "nationRulesets": [...] }`, `{ "nationStrategy": [...] }`, `{ "botStateTables": { ... } }`, and `{ "botTradeRoutesTables": { ... } }`.

## Safety and legal boundary
- Private official names/text must stay local.
- Use `public_placeholder_name` for screenshots/demos.
- `generated-private/` and `reference/` are gitignored to avoid accidental leaks.

## UI render safety for stream/public builds
Safe-for-stream/public-build criteria:
- `privateName` and `rawEffectTextPrivate` are rendered only through the shared guard in `app/src/ui/debug/privateCardDebug.ts`.
- The guard is opt-in only: `VITE_SHOW_PRIVATE_CARD_DEBUG` must be exactly `"true"` for private fields to render.
- Release/public builds must not set `VITE_SHOW_PRIVATE_CARD_DEBUG` (or set it to `"false"`).

Pre-release verification checklist:
1. Confirm `app/src/ui/debug/privateCardDebug.ts` still defines the canonical guard.
2. Search UI render points for private fields and verify they use that guard:
   - `rg "privateName|rawEffectTextPrivate" app/src/ui`
3. Check environment and deployment configs to confirm `VITE_SHOW_PRIVATE_CARD_DEBUG` is not enabled for production/public targets.
4. Perform a manual UI sanity pass in a non-debug build to verify private fields are not visible.

## Suggested incremental workflow
1. Enter 10–15 simple cards.
2. Implement `effect_ops_json` for those cards.
3. Write tests.
4. Add one simple placeholder nation.
5. Expand gradually.
