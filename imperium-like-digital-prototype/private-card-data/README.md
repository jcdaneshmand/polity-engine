# Private Card Data Folder

This folder is for **local-only private transcription files**. Keep official/private card and nation data out of git.

Allowed committed files:
- `card-data-template.csv`
- `nation-data-template.csv`
- `nation-ruleset-template.csv`
- `nation-strategy-template.csv`
- `bot-state-table-template.csv`
- `bot-trade-routes-table-template.csv`
- this README
- `.gitkeep`

All other CSV/TSV/XLSX/JSON files in this folder are gitignored.

The final private-data gate expects these ignored local CSV files:

| Required local file | Start from template |
| --- | --- |
| `imperium_cards_private.csv` | `card-data-template.csv` |
| `imperium_nations_private.csv` | `nation-data-template.csv` |
| `imperium_nation_rulesets_private.csv` | `nation-ruleset-template.csv` |
| `imperium_nation_strategy_private.csv` | `nation-strategy-template.csv` |
| `imperium_bot_state_tables_private.csv` | `bot-state-table-template.csv` |
| `imperium_bot_trade_routes_private.csv` | `bot-trade-routes-table-template.csv` |

The repository has an automated ignore-rule check for this boundary: local private CSV sources and generated private JSON reports must stay ignored, while the committed template CSVs and this README remain trackable.

To see the current private-data workspace state without failing the full gate, run this from `imperium-like-digital-prototype/`:

```powershell
npm.cmd run private:status
```

The status report is public-safe: it contains filenames, output paths, row counts, and check statuses only.

To create any missing local files from the template headers without overwriting existing data, run:

```powershell
npm.cmd run private:scaffold
```

After those local-only files exist, each required CSV has at least one data row, and the headers still match the templates, run:

```powershell
npm.cmd run private:gate
```

For diagnosis, `private:gate` runs the public-safe preflight report, import-all, and generated-artifact freshness verification in order. `private:import-all` includes the completeness report. The report artifacts contain filenames, output paths, row counts, and check statuses only; do not commit local private CSVs or generated private JSON.
