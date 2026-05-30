# Keyboard Private Data Entry Design

## Context

Private card and nation data currently stays local in `private-card-data/` and flows through CSV templates, validators, import scripts, generated private JSON, and runtime loaders. This protects official/private card text from the public repo while keeping the rules engine testable.

The current workflow is reliable but not friendly for physical-card transcription. It asks the user to work directly in CSV, repeat batch-level fields many times, and think about engine-oriented fields before the basic card identity pass is complete.

This design adds a local-only keyboard-first transcription desk. It simplifies entry while preserving the existing CSV/import pipeline underneath.

## Goals

- Make physical card transcription fast from a keyboard.
- Support a commons-first workflow across all commons sets, followed by nation deck batches in any order.
- Reduce repeated field entry through batch profiles and sticky defaults.
- Keep raw official/private text local-only.
- Export to the existing private CSV shape so validators, importers, reports, and runtime loaders keep working.
- Separate the identity/text transcription pass from later effect implementation.

## Non-Goals

- OCR or camera-assisted entry.
- Replacing the existing CSV validators/importers.
- Committing private card names or official text.
- Full card database administration for public/demo data.
- Implementing every card effect during transcription.
- Cloud sync, accounts, or shared editing.

## User Workflow

The user starts a transcription session by choosing a batch profile.

Commons batches are entered first:

- `Commons > Classics`
- `Commons > Legends`
- `Commons > Horizons`
- `Commons > Trade Routes`
- `Commons > Replacement Cards`

Nation batches come next. Each nation deck is its own batch, but nation order is intentionally flexible.

Within a batch, the app shows one focused card form at a time. Save advances immediately to the next blank card. The previous card remains available for duplicate/copy-forward actions so repeated structure is cheap.

The first pass emphasizes identity and raw text:

- Card ID.
- Private card name.
- Public placeholder name.
- Suit and optional suit icons.
- Card type.
- State requirement.
- Costs.
- Victory point mode and value.
- Starting location.
- Player count requirement.
- Raw private effect text.
- Tags and notes.

`effect_ops_json`, `implemented`, and `tested` remain available but should not interrupt transcription. New cards default to `implemented=false` and `tested=false`.

## Keyboard Interaction

The form is optimized for fast repeated entry:

- Tab order follows the physical-card scan order.
- `Ctrl+Enter` saves and opens the next blank card.
- `Ctrl+D` duplicates safe structure from the previous card without copying private raw text by default.
- `Ctrl+Shift+D` duplicates the full previous draft when intentionally entering variants or near-identical cards.
- `Esc` returns focus to the current field group or exits lightweight popovers.
- Dropdowns support typeahead and first-letter selection.
- Numeric fields accept blank as zero when the existing CSV importer treats blank as zero.

The UI should avoid modal interruptions during normal entry. Validation messages appear inline and in a compact status strip.

## Batch Profiles

A batch profile supplies defaults for repeated CSV fields. Defaults are editable for the current card and can be changed for future cards in the same batch.

Common defaults include:

- `source_box`.
- `set_or_nation`.
- `ownership`.
- `commons_set_id`.
- `commons_group`.
- `is_trade_route_expansion`.
- `required_expansions`.
- `starting_location`.
- `player_count_requirement`.
- `implemented=false`.
- `tested=false`.

Commons profiles set `ownership=commons`. Nation profiles set `ownership=nation` and use the selected nation as `set_or_nation`. Replacement profiles set replacement-friendly defaults but do not require replacement metadata before the row can be saved as a draft.

## Architecture

Add a local transcription desk in the app layer or as a small sibling local tool. The first implementation should prefer the existing React app if it can read and write local files in the chosen development workflow without unsafe browser assumptions. If browser file writes are awkward, use a local Node-backed tool that serves the UI and writes CSV files explicitly.

Core units:

- Batch profile catalog: defines commons and nation batch defaults.
- Card draft model: represents one editable card row before CSV serialization.
- CSV adapter: reads existing private CSV rows and writes the current card-data CSV header order.
- Validation adapter: reuses `validatePrivateCardsRows` for row-level and file-level feedback.
- Transcription UI: provides the keyboard-first one-card form and batch navigation.

The CSV adapter should preserve existing rows and header order from `card-data-template.csv`. It should write only local private files under `private-card-data/`.

## Data Flow

1. User chooses or creates a private card CSV target, defaulting to `private-card-data/imperium_cards_private.csv`.
2. Tool loads existing rows if the file exists.
3. User chooses a batch profile.
4. New card drafts are initialized from batch defaults and previous-card sticky values.
5. On save, the draft is normalized into a CSV row.
6. The row is validated with the existing private-card validation logic.
7. Valid rows are appended or updated in the local CSV.
8. The user can run the existing import pipeline without a special export step.

The tool may also offer an explicit "Validate All" action that runs the same validation used by `npm run cards:validate`.

## Error Handling

Validation should distinguish blocking errors from advisory warnings.

Blocking examples:

- Missing required `card_id`.
- Duplicate `card_id`.
- Invalid enum values.
- Invalid JSON in `effect_ops_json`.
- Invalid booleans.
- Invalid numeric fields.

Warnings should not stop identity-first entry:

- Raw private text exists but `effect_ops_json` is blank.
- `implemented=true` but `tested=false`.
- Public placeholder name matches private card name.

When a save is blocked, focus should move to the first blocking field. Warnings appear in the status strip and can be reviewed later.

## Privacy And Safety

The tool must treat private data as local-only:

- Read and write private data only under `private-card-data/` or `generated-private/`.
- Do not add private CSV/JSON files to git.
- Do not render private text in public/demo builds.
- Keep the existing `VITE_SHOW_PRIVATE_CARD_DEBUG` guard as the runtime display boundary.
- Keep generated public-safe placeholder names distinct from private card names.

No network dependency is required for transcription.

## Testing And Verification

Verification should include:

- Unit tests for batch default application.
- Unit tests for CSV read/write round trips preserving header order.
- Unit tests for duplicate previous card behavior.
- Unit tests proving row validation reuses existing validator behavior.
- A small integration test that creates a temporary private CSV, saves several cards across two batches, validates the file, and confirms existing import scripts can consume it.

Manual verification should include a keyboard-only pass through at least one commons batch and one nation batch.

## Implementation Decisions

- Start with card data only; nation/ruleset/bot table entry can follow after the card workflow proves itself.
- Preserve `private-card-data/card-data-template.csv` as the canonical CSV header source.
- Default new card rows to `implemented=false` and `tested=false`.
- Do not require `effect_ops_json` during the identity/raw-text pass.
- Optimize first for Commons batches, then Nation deck batches.
