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

After those local-only files exist, run:

```powershell
npm.cmd run private:preflight
npm.cmd run private:import-all
npm.cmd run private:completeness
```
