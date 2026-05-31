# Card transcription workflow

This workflow turns the web-mined structural notes into private local card data without committing official text.

## Working files

- Use `private-card-data/manual-transcription-tracker.csv` to choose the next deck or pile.
- Enter actual card rows in `private-card-data/imperium_cards_private.csv`, copied from `private-card-data/card-data-template.csv`.
- Keep exact card text in `raw_effect_text_private` only. That file is gitignored.
- Keep committed docs limited to structural facts, implementation notes, and public-safe summaries.

## Recommended order

1. Transcribe identities for Classics Commons and the eight Classics nations.
2. Add Horizons replacement cards before deep effect work, because they may supersede Classics/Legends rows.
3. Fill Horizons Trade Routes-required nations early: Abbasids, Aksumites, Guptas, Sassanids, Tang, Wagadou.
4. Leave high-custom nations for later batches: Cultists, Martians, Polynesians, Utopians, Atlanteans, Arthurians.

## Identity-first pass

For each card, fill these fields before touching effects:

- `card_id`
- `source_box`
- `set_or_nation`
- `card_name_private`
- `public_placeholder_name`
- `suit`
- `card_type`
- `state_requirement`
- `starting_location`
- `player_count_requirement`
- `is_trade_route_expansion`
- `tags`
- `notes`

This pass is enough to unlock card-reference validation for private nations and to start replacing placeholder setup data.

## Effect pass

Use `raw_effect_text_private` for the exact local-only text. Encode `effect_ops_json` only when the engine already supports the operation or the required hook is clear.

For conditional victory points, keep `vp_mode=conditional`. Use `vp_value` for a single imported resolved value, or `vp_details_json` for structured branches. Zone-sensitive cards such as higher VP in History can use:

```json
{"condition":{"op":"self_in_zone","zoneId":"history"},"trueValue":8,"falseValue":3}
```

For variable victory points that count cards in known zones, keep `vp_mode=variable` and put the count formula in `vp_details_json`. Example: 2 VP per Region-tagged card in play or History, capped at 6:

```json
{"formula":{"op":"count_cards","tag":"region","zones":["playArea","history"],"amountEach":2,"cap":6}}
```

Prefer these generic tags while triaging effects:

- `market_acquisition`
- `market_resource`
- `trade_routes`
- `goods`
- `fame`
- `unrest`
- `history`
- `alternate_history`
- `state_custom`
- `reverse_progression`
- `development`
- `side_area`
- `collapse`
- `solo_bot`
- `replacement_card`

Set `implemented=false,tested=false` until a card effect is both represented and covered by tests.

## Validation loop

After each small batch:

1. Run card validation.
2. Fix malformed JSON, enum values, and duplicate IDs.
3. Import cards to `generated-private/cards.normalized.json`.
4. Import nations once `imperium_nations_private.csv` exists.
5. Run `private:import-all` once all required private source files are present.

The runtime now automatically uses generated private replacements when both `generated-private/cards.normalized.json` and `generated-private/nations.normalized.json` exist.
