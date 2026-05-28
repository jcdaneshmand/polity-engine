# Nation Ruleset Private Workflow

1. Copy `private-card-data/nation-ruleset-template.csv` and `private-card-data/nation-strategy-template.csv` to local private filenames.
2. Fill tags and JSON override columns incrementally.
3. Validate:
   - `npm run rulesets:validate -- private-card-data/your_rulesets.csv`
   - `npm run strategy:validate -- private-card-data/your_strategy.csv`
4. Import:
   - `npm run rulesets:import -- --input ... --output generated-private/nation-rulesets.normalized.json --report generated-private/nation-ruleset-import-report.json`
   - `npm run strategy:import -- --input ... --output generated-private/nation-strategy.normalized.json --report generated-private/nation-strategy-import-report.json`

Use `public_placeholder_name` and `public_summary` for safe UI/demo output.
Keep official/reference text in local-only private files.
