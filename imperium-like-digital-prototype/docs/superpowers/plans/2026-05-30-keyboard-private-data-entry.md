# Keyboard Private Data Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local keyboard-first private card transcription desk that writes the existing private card CSV format.

**Architecture:** Add a small Node-backed local tool under `tools/card-entry/`. Shared TypeScript modules own batch profiles, card draft behavior, CSV persistence, validation, and the HTTP API; a static browser UI talks to that local API and never writes files directly.

**Tech Stack:** TypeScript, Node `http`, `fs`, `path`, existing `papaparse`, existing private-card validator/importer, Vitest through the engine test harness.

---

## File Structure

- Create `imperium-like-digital-prototype/tools/card-entry/cardEntryTypes.ts`: shared draft, profile, API, and validation result types.
- Create `imperium-like-digital-prototype/tools/card-entry/batchProfiles.ts`: commons profiles plus nation profile factory.
- Create `imperium-like-digital-prototype/tools/card-entry/cardDraft.ts`: draft creation, duplicate behavior, CSV row conversion, sticky defaults.
- Create `imperium-like-digital-prototype/tools/card-entry/cardCsvStore.ts`: read template header, load rows, upsert rows, write CSV.
- Create `imperium-like-digital-prototype/tools/card-entry/cardEntryService.ts`: combine profiles, draft conversion, validation, and persistence.
- Create `imperium-like-digital-prototype/tools/card-entry/cardEntryServer.ts`: local HTTP server and JSON API.
- Create `imperium-like-digital-prototype/tools/card-entry/public/index.html`: static transcription UI shell.
- Create `imperium-like-digital-prototype/tools/card-entry/public/app.js`: keyboard-first browser client.
- Create `imperium-like-digital-prototype/tools/card-entry/public/styles.css`: compact data-entry styling.
- Modify `imperium-like-digital-prototype/package.json`: add `cards:entry` script.
- Modify `imperium-like-digital-prototype/docs/private-card-data-workflow.md`: document the new entry path.
- Create `imperium-like-digital-prototype/engine/src/tests/cardEntryProfiles.test.ts`: profiles and draft behavior tests.
- Create `imperium-like-digital-prototype/engine/src/tests/cardEntryCsvStore.test.ts`: CSV round-trip tests.
- Create `imperium-like-digital-prototype/engine/src/tests/cardEntryService.test.ts`: validation and save flow tests.

## Task 1: Batch Profiles And Draft Defaults

**Files:**
- Create: `imperium-like-digital-prototype/tools/card-entry/cardEntryTypes.ts`
- Create: `imperium-like-digital-prototype/tools/card-entry/batchProfiles.ts`
- Create: `imperium-like-digital-prototype/tools/card-entry/cardDraft.ts`
- Test: `imperium-like-digital-prototype/engine/src/tests/cardEntryProfiles.test.ts`

- [ ] **Step 1: Write the failing profile and draft tests**

```ts
import { describe, expect, it } from "vitest";
import { commonsBatchProfiles, createNationBatchProfile } from "../../../tools/card-entry/batchProfiles";
import { createBlankCardDraft, duplicateCardDraft, draftToCsvRow } from "../../../tools/card-entry/cardDraft";

describe("card entry batch profiles", () => {
  it("defines the commons batches in the transcription order", () => {
    expect(commonsBatchProfiles.map((profile) => profile.id)).toEqual([
      "commons-classics",
      "commons-legends",
      "commons-horizons",
      "commons-trade-routes",
      "commons-replacements"
    ]);
  });

  it("creates commons drafts with safe identity-pass defaults", () => {
    const draft = createBlankCardDraft(commonsBatchProfiles[0]);
    expect(draft.ownership).toBe("commons");
    expect(draft.commonsSetId).toBe("classics");
    expect(draft.implemented).toBe("false");
    expect(draft.tested).toBe("false");
    expect(draft.effectOpsJson).toBe("");
  });

  it("creates nation profiles with the selected nation as set_or_nation", () => {
    const profile = createNationBatchProfile("romans");
    const row = draftToCsvRow(createBlankCardDraft(profile));
    expect(row.ownership).toBe("nation");
    expect(row.set_or_nation).toBe("romans");
    expect(row.commons_set_id).toBe("");
  });

  it("duplicates safe structure without private text by default", () => {
    const original = {
      ...createBlankCardDraft(commonsBatchProfiles[0]),
      cardId: "card_a",
      privateName: "Private A",
      publicPlaceholderName: "Placeholder A",
      rawEffectTextPrivate: "private text",
      notes: "private note"
    };

    const duplicate = duplicateCardDraft(original, { includePrivateText: false });

    expect(duplicate.cardId).toBe("");
    expect(duplicate.privateName).toBe("");
    expect(duplicate.publicPlaceholderName).toBe("");
    expect(duplicate.rawEffectTextPrivate).toBe("");
    expect(duplicate.notes).toBe("private note");
    expect(duplicate.suit).toBe(original.suit);
  });

  it("duplicates full drafts when requested", () => {
    const original = {
      ...createBlankCardDraft(commonsBatchProfiles[0]),
      rawEffectTextPrivate: "same variant text"
    };

    const duplicate = duplicateCardDraft(original, { includePrivateText: true });

    expect(duplicate.rawEffectTextPrivate).toBe("same variant text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w engine -- cardEntryProfiles.test.ts`

Expected: FAIL with an import error for `../../../tools/card-entry/batchProfiles`.

- [ ] **Step 3: Add shared types**

Create `tools/card-entry/cardEntryTypes.ts`:

```ts
import type { PrivateCardCsvRow } from "../card-import/cardCsvTypes";

export type BatchProfileKind = "commons" | "nation";

export type CardEntryBatchProfile = {
  id: string;
  label: string;
  kind: BatchProfileKind;
  defaults: Partial<PrivateCardCsvRow>;
};

export type CardEntryDraft = {
  cardId: string;
  sourceBox: string;
  setOrNation: string;
  privateName: string;
  publicPlaceholderName: string;
  suit: string;
  suitIcons: string;
  cardType: string;
  stateRequirement: string;
  costMaterials: string;
  costPopulation: string;
  costProgress: string;
  costGoods: string;
  developmentCostMaterials: string;
  developmentCostPopulation: string;
  developmentCostProgress: string;
  developmentCostGoods: string;
  vpMode: string;
  vpValue: string;
  startingLocation: string;
  playerCountRequirement: string;
  isTradeRouteExpansion: string;
  rawEffectTextPrivate: string;
  effectOpsJson: string;
  tags: string;
  notes: string;
  implemented: string;
  tested: string;
  requiredExpansions: string;
  excludedExpansions: string;
  allowedModes: string;
  disallowedModes: string;
  ownership: string;
  commonsSetId: string;
  setupBannerSuit: string;
  commonsGroup: string;
  replacementForCardId: string;
  replacementGroupId: string;
  conflictsWithNationIds: string;
  delayableInLoweredAggression: string;
  marketEligible: string;
  smallDeckEligible: string;
  mainDeckEligible: string;
  unrestPileEligible: string;
  fameDeckEligible: string;
};

export type DuplicateCardDraftOptions = {
  includePrivateText: boolean;
};
```

- [ ] **Step 4: Add batch profiles**

Create `tools/card-entry/batchProfiles.ts`:

```ts
import type { CardEntryBatchProfile } from "./cardEntryTypes";

const baseCommonsDefaults = {
  source_box: "",
  ownership: "commons",
  starting_location: "market",
  player_count_requirement: "2+",
  is_trade_route_expansion: "false",
  effect_ops_json: "",
  implemented: "false",
  tested: "false"
};

export const commonsBatchProfiles: CardEntryBatchProfile[] = [
  {
    id: "commons-classics",
    label: "Commons > Classics",
    kind: "commons",
    defaults: { ...baseCommonsDefaults, set_or_nation: "classics", commons_set_id: "classics", commons_group: "base" }
  },
  {
    id: "commons-legends",
    label: "Commons > Legends",
    kind: "commons",
    defaults: { ...baseCommonsDefaults, set_or_nation: "legends", commons_set_id: "legends", commons_group: "base" }
  },
  {
    id: "commons-horizons",
    label: "Commons > Horizons",
    kind: "commons",
    defaults: { ...baseCommonsDefaults, set_or_nation: "horizons", commons_set_id: "horizons", commons_group: "base" }
  },
  {
    id: "commons-trade-routes",
    label: "Commons > Trade Routes",
    kind: "commons",
    defaults: {
      ...baseCommonsDefaults,
      set_or_nation: "trade_routes",
      commons_set_id: "horizons",
      commons_group: "trade_routes",
      is_trade_route_expansion: "true",
      required_expansions: "trade_routes"
    }
  },
  {
    id: "commons-replacements",
    label: "Commons > Replacement Cards",
    kind: "commons",
    defaults: { ...baseCommonsDefaults, set_or_nation: "replacements", commons_set_id: "horizons", commons_group: "replacement" }
  }
];

export function createNationBatchProfile(nationId: string): CardEntryBatchProfile {
  return {
    id: `nation-${nationId}`,
    label: `Nation > ${nationId}`,
    kind: "nation",
    defaults: {
      source_box: "",
      set_or_nation: nationId,
      ownership: "nation",
      starting_location: "nation_deck",
      player_count_requirement: "any",
      is_trade_route_expansion: "false",
      effect_ops_json: "",
      implemented: "false",
      tested: "false"
    }
  };
}
```

- [ ] **Step 5: Add draft helpers**

Create `tools/card-entry/cardDraft.ts`:

```ts
import type { PrivateCardCsvRow } from "../card-import/cardCsvTypes";
import type { CardEntryBatchProfile, CardEntryDraft, DuplicateCardDraftOptions } from "./cardEntryTypes";

const blankDraft: CardEntryDraft = {
  cardId: "",
  sourceBox: "",
  setOrNation: "",
  privateName: "",
  publicPlaceholderName: "",
  suit: "none",
  suitIcons: "",
  cardType: "action",
  stateRequirement: "",
  costMaterials: "",
  costPopulation: "",
  costProgress: "",
  costGoods: "",
  developmentCostMaterials: "",
  developmentCostPopulation: "",
  developmentCostProgress: "",
  developmentCostGoods: "",
  vpMode: "none",
  vpValue: "",
  startingLocation: "market",
  playerCountRequirement: "",
  isTradeRouteExpansion: "false",
  rawEffectTextPrivate: "",
  effectOpsJson: "",
  tags: "",
  notes: "",
  implemented: "false",
  tested: "false",
  requiredExpansions: "",
  excludedExpansions: "",
  allowedModes: "",
  disallowedModes: "",
  ownership: "commons",
  commonsSetId: "",
  setupBannerSuit: "",
  commonsGroup: "",
  replacementForCardId: "",
  replacementGroupId: "",
  conflictsWithNationIds: "",
  delayableInLoweredAggression: "",
  marketEligible: "",
  smallDeckEligible: "",
  mainDeckEligible: "",
  unrestPileEligible: "",
  fameDeckEligible: ""
};

export function createBlankCardDraft(profile: CardEntryBatchProfile): CardEntryDraft {
  return csvRowToDraft({ ...draftToCsvRow(blankDraft), ...profile.defaults });
}

export function duplicateCardDraft(draft: CardEntryDraft, options: DuplicateCardDraftOptions): CardEntryDraft {
  return {
    ...draft,
    cardId: "",
    privateName: options.includePrivateText ? draft.privateName : "",
    publicPlaceholderName: options.includePrivateText ? draft.publicPlaceholderName : "",
    rawEffectTextPrivate: options.includePrivateText ? draft.rawEffectTextPrivate : "",
    effectOpsJson: options.includePrivateText ? draft.effectOpsJson : "",
    implemented: "false",
    tested: "false"
  };
}

export function draftToCsvRow(draft: CardEntryDraft): PrivateCardCsvRow {
  return {
    card_id: draft.cardId,
    source_box: draft.sourceBox,
    set_or_nation: draft.setOrNation,
    card_name_private: draft.privateName,
    public_placeholder_name: draft.publicPlaceholderName,
    suit: draft.suit,
    suit_icons: draft.suitIcons,
    card_type: draft.cardType,
    state_requirement: draft.stateRequirement,
    cost_materials: draft.costMaterials,
    cost_population: draft.costPopulation,
    cost_progress: draft.costProgress,
    cost_goods: draft.costGoods,
    development_cost_materials: draft.developmentCostMaterials,
    development_cost_population: draft.developmentCostPopulation,
    development_cost_progress: draft.developmentCostProgress,
    development_cost_goods: draft.developmentCostGoods,
    vp_mode: draft.vpMode,
    vp_value: draft.vpValue,
    starting_location: draft.startingLocation,
    player_count_requirement: draft.playerCountRequirement,
    is_trade_route_expansion: draft.isTradeRouteExpansion,
    raw_effect_text_private: draft.rawEffectTextPrivate,
    effect_ops_json: draft.effectOpsJson,
    tags: draft.tags,
    notes: draft.notes,
    implemented: draft.implemented,
    tested: draft.tested,
    required_expansions: draft.requiredExpansions,
    excluded_expansions: draft.excludedExpansions,
    allowed_modes: draft.allowedModes,
    disallowed_modes: draft.disallowedModes,
    ownership: draft.ownership,
    commons_set_id: draft.commonsSetId,
    setup_banner_suit: draft.setupBannerSuit,
    commons_group: draft.commonsGroup,
    replacement_for_card_id: draft.replacementForCardId,
    replacement_group_id: draft.replacementGroupId,
    conflicts_with_nation_ids: draft.conflictsWithNationIds,
    delayable_in_lowered_aggression: draft.delayableInLoweredAggression,
    market_eligible: draft.marketEligible,
    small_deck_eligible: draft.smallDeckEligible,
    main_deck_eligible: draft.mainDeckEligible,
    unrest_pile_eligible: draft.unrestPileEligible,
    fame_deck_eligible: draft.fameDeckEligible
  };
}

export function csvRowToDraft(row: PrivateCardCsvRow): CardEntryDraft {
  return {
    ...blankDraft,
    cardId: row.card_id || "",
    sourceBox: row.source_box || "",
    setOrNation: row.set_or_nation || "",
    privateName: row.card_name_private || "",
    publicPlaceholderName: row.public_placeholder_name || "",
    suit: row.suit || "none",
    suitIcons: row.suit_icons || "",
    cardType: row.card_type || "action",
    stateRequirement: row.state_requirement || "",
    costMaterials: row.cost_materials || "",
    costPopulation: row.cost_population || "",
    costProgress: row.cost_progress || "",
    costGoods: row.cost_goods || "",
    developmentCostMaterials: row.development_cost_materials || "",
    developmentCostPopulation: row.development_cost_population || "",
    developmentCostProgress: row.development_cost_progress || "",
    developmentCostGoods: row.development_cost_goods || "",
    vpMode: row.vp_mode || "none",
    vpValue: row.vp_value || "",
    startingLocation: row.starting_location || "market",
    playerCountRequirement: row.player_count_requirement || "",
    isTradeRouteExpansion: row.is_trade_route_expansion || "false",
    rawEffectTextPrivate: row.raw_effect_text_private || "",
    effectOpsJson: row.effect_ops_json || "",
    tags: row.tags || "",
    notes: row.notes || "",
    implemented: row.implemented || "false",
    tested: row.tested || "false",
    requiredExpansions: row.required_expansions || "",
    excludedExpansions: row.excluded_expansions || "",
    allowedModes: row.allowed_modes || "",
    disallowedModes: row.disallowed_modes || "",
    ownership: row.ownership || "commons",
    commonsSetId: row.commons_set_id || "",
    setupBannerSuit: row.setup_banner_suit || "",
    commonsGroup: row.commons_group || "",
    replacementForCardId: row.replacement_for_card_id || "",
    replacementGroupId: row.replacement_group_id || "",
    conflictsWithNationIds: row.conflicts_with_nation_ids || "",
    delayableInLoweredAggression: row.delayable_in_lowered_aggression || "",
    marketEligible: row.market_eligible || "",
    smallDeckEligible: row.small_deck_eligible || "",
    mainDeckEligible: row.main_deck_eligible || "",
    unrestPileEligible: row.unrest_pile_eligible || "",
    fameDeckEligible: row.fame_deck_eligible || ""
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -w engine -- cardEntryProfiles.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/card-entry/cardEntryTypes.ts tools/card-entry/batchProfiles.ts tools/card-entry/cardDraft.ts engine/src/tests/cardEntryProfiles.test.ts
git commit -m "Add private card entry draft profiles"
```

## Task 2: CSV Store

**Files:**
- Create: `imperium-like-digital-prototype/tools/card-entry/cardCsvStore.ts`
- Test: `imperium-like-digital-prototype/engine/src/tests/cardEntryCsvStore.test.ts`

- [ ] **Step 1: Write failing CSV store tests**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appendOrReplaceCardRow, loadCardCsvRows, readCardTemplateHeader, writeCardCsvRows } from "../../../tools/card-entry/cardCsvStore";

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "card-entry-"));
}

describe("card entry CSV store", () => {
  it("reads the committed card template header", () => {
    const header = readCardTemplateHeader(path.join(fixtureRoot, "private-card-data/card-data-template.csv"));
    expect(header[0]).toBe("card_id");
    expect(header).toContain("raw_effect_text_private");
    expect(header).toContain("commons_group");
  });

  it("writes rows in template header order and loads them back", () => {
    const dir = tempDir();
    const filePath = path.join(dir, "imperium_cards_private.csv");
    const templatePath = path.join(fixtureRoot, "private-card-data/card-data-template.csv");

    writeCardCsvRows({
      filePath,
      templatePath,
      rows: [{ card_id: "a", public_placeholder_name: "A", suit: "none", card_type: "action", starting_location: "market", vp_mode: "none", implemented: "false", tested: "false" }]
    });

    const raw = fs.readFileSync(filePath, "utf8");
    expect(raw.split(/\r?\n/)[0].startsWith("card_id,source_box,set_or_nation")).toBe(true);
    expect(loadCardCsvRows(filePath)[0].card_id).toBe("a");
  });

  it("appends new rows and replaces matching card ids", () => {
    const rows = appendOrReplaceCardRow(
      [{ card_id: "a", public_placeholder_name: "Old A" }],
      { card_id: "a", public_placeholder_name: "New A" }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].public_placeholder_name).toBe("New A");

    const appended = appendOrReplaceCardRow(rows, { card_id: "b", public_placeholder_name: "B" });
    expect(appended.map((row) => row.card_id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w engine -- cardEntryCsvStore.test.ts`

Expected: FAIL with an import error for `../../../tools/card-entry/cardCsvStore`.

- [ ] **Step 3: Implement the CSV store**

Create `tools/card-entry/cardCsvStore.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { parseCsvFile } from "../card-import/csvParser";
import type { PrivateCardCsvRow } from "../card-import/cardCsvTypes";

export function readCardTemplateHeader(templatePath: string): string[] {
  const firstLine = fs.readFileSync(templatePath, "utf8").split(/\r?\n/)[0];
  return firstLine.split(",").map((field) => field.trim()).filter(Boolean);
}

export function loadCardCsvRows(filePath: string): PrivateCardCsvRow[] {
  if (!fs.existsSync(filePath)) return [];
  return parseCsvFile(filePath) as PrivateCardCsvRow[];
}

export function appendOrReplaceCardRow(rows: PrivateCardCsvRow[], row: PrivateCardCsvRow): PrivateCardCsvRow[] {
  const cardId = row.card_id?.trim();
  const index = rows.findIndex((existing) => existing.card_id?.trim() === cardId);
  if (index === -1) return [...rows, row];
  return rows.map((existing, existingIndex) => existingIndex === index ? row : existing);
}

export function writeCardCsvRows(args: { filePath: string; templatePath: string; rows: PrivateCardCsvRow[] }) {
  const fields = readCardTemplateHeader(args.templatePath);
  const normalizedRows = args.rows.map((row) => {
    const normalized: PrivateCardCsvRow = {};
    for (const field of fields) normalized[field] = row[field] ?? "";
    return normalized;
  });

  fs.mkdirSync(path.dirname(args.filePath), { recursive: true });
  fs.writeFileSync(args.filePath, Papa.unparse(normalizedRows, { columns: fields, newline: "\n" }) + "\n", "utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -w engine -- cardEntryCsvStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/card-entry/cardCsvStore.ts engine/src/tests/cardEntryCsvStore.test.ts
git commit -m "Add private card entry CSV store"
```

## Task 3: Entry Service

**Files:**
- Create: `imperium-like-digital-prototype/tools/card-entry/cardEntryService.ts`
- Test: `imperium-like-digital-prototype/engine/src/tests/cardEntryService.test.ts`

- [ ] **Step 1: Write failing service tests**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commonsBatchProfiles } from "../../../tools/card-entry/batchProfiles";
import { createBlankCardDraft } from "../../../tools/card-entry/cardDraft";
import { createCardEntryService } from "../../../tools/card-entry/cardEntryService";

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function makeService() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "card-entry-service-"));
  fs.mkdirSync(path.join(root, "private-card-data"), { recursive: true });
  fs.copyFileSync(
    path.join(fixtureRoot, "private-card-data/card-data-template.csv"),
    path.join(root, "private-card-data/card-data-template.csv")
  );
  return createCardEntryService({ root });
}

describe("card entry service", () => {
  it("returns profiles and creates blank drafts", () => {
    const service = makeService();
    const session = service.getSession();
    expect(session.profiles.map((profile) => profile.id)).toContain("commons-classics");
    expect(session.draft.cardId).toBe("");
  });

  it("saves valid rows and reports validation warnings", () => {
    const service = makeService();
    const draft = {
      ...createBlankCardDraft(commonsBatchProfiles[0]),
      cardId: "classics_a",
      privateName: "Private A",
      publicPlaceholderName: "Placeholder A",
      suit: "region",
      cardType: "action",
      startingLocation: "market",
      vpMode: "none",
      rawEffectTextPrivate: "private text",
      effectOpsJson: ""
    };

    const result = service.saveDraft(draft);

    expect(result.ok).toBe(true);
    expect(result.report.counts.rows).toBe(1);
    expect(result.report.counts.warnings).toBeGreaterThan(0);
    expect(service.getSession().rows[0].card_id).toBe("classics_a");
  });

  it("blocks invalid rows without writing them", () => {
    const service = makeService();
    const draft = { ...createBlankCardDraft(commonsBatchProfiles[0]), cardId: "", publicPlaceholderName: "" };

    const result = service.saveDraft(draft);

    expect(result.ok).toBe(false);
    expect(result.report.counts.fatal).toBeGreaterThan(0);
    expect(service.getSession().rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w engine -- cardEntryService.test.ts`

Expected: FAIL with an import error for `../../../tools/card-entry/cardEntryService`.

- [ ] **Step 3: Implement service**

Create `tools/card-entry/cardEntryService.ts`:

```ts
import path from "node:path";
import { validatePrivateCardsRows } from "../card-import/validatePrivateCards";
import type { PrivateCardCsvRow } from "../card-import/cardCsvTypes";
import { commonsBatchProfiles } from "./batchProfiles";
import { createBlankCardDraft, draftToCsvRow } from "./cardDraft";
import { appendOrReplaceCardRow, loadCardCsvRows, writeCardCsvRows } from "./cardCsvStore";
import type { CardEntryDraft } from "./cardEntryTypes";

export type CardEntrySession = {
  csvPath: string;
  rows: PrivateCardCsvRow[];
  profiles: typeof commonsBatchProfiles;
  draft: CardEntryDraft;
};

export type SaveDraftResult = {
  ok: boolean;
  report: ReturnType<typeof validatePrivateCardsRows>;
  row?: PrivateCardCsvRow;
};

export function createCardEntryService(args: { root: string; csvPath?: string }) {
  const csvPath = path.resolve(args.root, args.csvPath ?? "private-card-data/imperium_cards_private.csv");
  const templatePath = path.resolve(args.root, "private-card-data/card-data-template.csv");

  function getRows() {
    return loadCardCsvRows(csvPath);
  }

  return {
    getSession(): CardEntrySession {
      return {
        csvPath,
        rows: getRows(),
        profiles: commonsBatchProfiles,
        draft: createBlankCardDraft(commonsBatchProfiles[0])
      };
    },

    saveDraft(draft: CardEntryDraft): SaveDraftResult {
      const row = draftToCsvRow(draft);
      const nextRows = appendOrReplaceCardRow(getRows(), row);
      const report = validatePrivateCardsRows(nextRows);
      if (report.counts.fatal > 0) return { ok: false, report, row };
      writeCardCsvRows({ filePath: csvPath, templatePath, rows: nextRows });
      return { ok: true, report, row };
    },

    validateAll() {
      return validatePrivateCardsRows(getRows());
    }
  };
}
```

- [ ] **Step 4: Run service test**

Run: `npm run test -w engine -- cardEntryService.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/card-entry/cardEntryService.ts engine/src/tests/cardEntryService.test.ts
git commit -m "Add private card entry service"
```

## Task 4: Local HTTP Server

**Files:**
- Create: `imperium-like-digital-prototype/tools/card-entry/cardEntryServer.ts`
- Modify: `imperium-like-digital-prototype/package.json`

- [ ] **Step 1: Add the server script to package.json**

Modify root `package.json` scripts:

```json
"cards:entry": "tsx tools/card-entry/cardEntryServer.ts"
```

- [ ] **Step 2: Implement the server**

Create `tools/card-entry/cardEntryServer.ts`:

```ts
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCardEntryService } from "./cardEntryService";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.CARD_ENTRY_PORT || 4177);
const service = createCardEntryService({ root });

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res: http.ServerResponse, requestPath: string) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.resolve(publicDir, `.${safePath}`);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  const type = ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "text/html";
  res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
  res.end(fs.readFileSync(filePath));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/session") {
      sendJson(res, 200, service.getSession());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/cards") {
      const body = await readJson(req);
      sendJson(res, 200, service.saveDraft((body as { draft: any }).draft));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/validate") {
      sendJson(res, 200, service.validateAll());
      return;
    }

    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, () => {
  console.log(`Private card entry desk: http://localhost:${port}`);
});
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS. If package JSON formatting changed, confirm it remains valid JSON with `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`.

- [ ] **Step 4: Commit**

```bash
git add package.json tools/card-entry/cardEntryServer.ts
git commit -m "Add local private card entry server"
```

## Task 5: Static Keyboard-First UI

**Files:**
- Create: `imperium-like-digital-prototype/tools/card-entry/public/index.html`
- Create: `imperium-like-digital-prototype/tools/card-entry/public/app.js`
- Create: `imperium-like-digital-prototype/tools/card-entry/public/styles.css`

- [ ] **Step 1: Create the HTML shell**

Create `tools/card-entry/public/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Private Card Entry</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="shell">
      <header class="toolbar">
        <div>
          <h1>Private Card Entry</h1>
          <p id="csv-path"></p>
        </div>
        <div class="toolbar-actions">
          <select id="profile"></select>
          <button id="validate-all" type="button">Validate All</button>
        </div>
      </header>

      <section id="status" class="status" aria-live="polite"></section>

      <form id="card-form" class="entry-grid">
        <label>Card ID <input name="cardId" autocomplete="off" required></label>
        <label>Private Name <input name="privateName" autocomplete="off"></label>
        <label>Placeholder Name <input name="publicPlaceholderName" autocomplete="off" required></label>
        <label>Suit <select name="suit"></select></label>
        <label>Suit Icons <input name="suitIcons" autocomplete="off"></label>
        <label>Type <select name="cardType"></select></label>
        <label>State <input name="stateRequirement" autocomplete="off"></label>
        <label>Start <select name="startingLocation"></select></label>
        <label>Players <input name="playerCountRequirement" autocomplete="off"></label>
        <label>Cost M <input name="costMaterials" inputmode="numeric"></label>
        <label>Cost P <input name="costPopulation" inputmode="numeric"></label>
        <label>Cost Prog <input name="costProgress" inputmode="numeric"></label>
        <label>Cost Goods <input name="costGoods" inputmode="numeric"></label>
        <label>VP Mode <select name="vpMode"></select></label>
        <label>VP <input name="vpValue" inputmode="decimal"></label>
        <label>Tags <input name="tags" autocomplete="off"></label>
        <label class="wide">Raw Private Text <textarea name="rawEffectTextPrivate" rows="6"></textarea></label>
        <label class="wide">Notes <textarea name="notes" rows="3"></textarea></label>
      </form>

      <footer class="footer-actions">
        <button id="duplicate-safe" type="button">Duplicate Structure</button>
        <button id="duplicate-full" type="button">Duplicate Full</button>
        <button id="save" type="button">Save / Next</button>
      </footer>
    </main>
    <script src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create compact styles**

Create `tools/card-entry/public/styles.css`:

```css
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f6f5f1;
  color: #1e2528;
}

body {
  margin: 0;
}

.shell {
  max-width: 1180px;
  margin: 0 auto;
  padding: 18px;
}

.toolbar,
.footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h1 {
  font-size: 24px;
  margin: 0 0 4px;
}

#csv-path {
  margin: 0;
  color: #5d676b;
  font-size: 13px;
}

.toolbar-actions,
.footer-actions {
  flex-wrap: wrap;
}

.status {
  min-height: 28px;
  margin: 14px 0;
  padding: 8px 10px;
  border: 1px solid #c9d1d5;
  background: #ffffff;
}

.status.error {
  border-color: #b94a48;
  color: #8f2725;
}

.status.ok {
  border-color: #4f8a5b;
  color: #2f673b;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 10px;
}

label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: #405055;
}

input,
select,
textarea,
button {
  font: inherit;
}

input,
select,
textarea {
  min-width: 0;
  border: 1px solid #b7c0c5;
  border-radius: 4px;
  padding: 8px;
  background: #fff;
}

textarea {
  resize: vertical;
}

.wide {
  grid-column: 1 / -1;
}

button {
  border: 1px solid #506068;
  border-radius: 4px;
  background: #263238;
  color: white;
  padding: 8px 12px;
  cursor: pointer;
}

button.secondary {
  background: #ffffff;
  color: #263238;
}

@media (max-width: 780px) {
  .entry-grid {
    grid-template-columns: repeat(2, minmax(130px, 1fr));
  }
}
```

- [ ] **Step 3: Create browser client**

Create `tools/card-entry/public/app.js`:

```js
const enumOptions = {
  suit: ["region", "uncivilized", "civilized", "tributary", "fame", "unrest", "power", "trade_route", "none", "multi"],
  cardType: ["action", "in_play", "attack", "power", "state", "development", "accession", "nation", "region", "unrest", "fame", "trade_route", "bot_state", "other"],
  startingLocation: ["draw_deck", "nation_deck", "accession", "development_area", "in_play", "supply", "market", "fame_deck", "unrest_pile", "bot_deck", "box", "other"],
  vpMode: ["none", "fixed", "variable", "negative", "conditional"]
};

const form = document.querySelector("#card-form");
const statusEl = document.querySelector("#status");
const profileSelect = document.querySelector("#profile");
const csvPathEl = document.querySelector("#csv-path");
let session;
let draft;
let previousDraft;

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
}

function fillSelect(name, values) {
  const select = form.elements[name];
  select.innerHTML = "";
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function writeForm(nextDraft) {
  draft = { ...nextDraft };
  for (const [key, value] of Object.entries(draft)) {
    if (form.elements[key]) form.elements[key].value = value ?? "";
  }
}

function readForm() {
  const next = { ...draft };
  for (const element of Array.from(form.elements)) {
    if (element.name) next[element.name] = element.value;
  }
  draft = next;
  return next;
}

function blankFromProfile(profileId) {
  const profile = session.profiles.find((item) => item.id === profileId) || session.profiles[0];
  const defaults = profile.defaults;
  return {
    ...session.draft,
    sourceBox: defaults.source_box || "",
    setOrNation: defaults.set_or_nation || "",
    startingLocation: defaults.starting_location || "market",
    playerCountRequirement: defaults.player_count_requirement || "",
    isTradeRouteExpansion: defaults.is_trade_route_expansion || "false",
    requiredExpansions: defaults.required_expansions || "",
    implemented: "false",
    tested: "false",
    ownership: defaults.ownership || "commons",
    commonsSetId: defaults.commons_set_id || "",
    commonsGroup: defaults.commons_group || ""
  };
}

async function loadSession() {
  for (const [name, values] of Object.entries(enumOptions)) fillSelect(name, values);
  const response = await fetch("/api/session");
  session = await response.json();
  csvPathEl.textContent = session.csvPath;
  profileSelect.innerHTML = "";
  for (const profile of session.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label;
    profileSelect.append(option);
  }
  writeForm(blankFromProfile(profileSelect.value));
  form.elements.cardId.focus();
}

async function saveDraft() {
  const current = readForm();
  const response = await fetch("/api/cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft: current })
  });
  const result = await response.json();
  if (!result.ok) {
    const first = result.report.errors.find((error) => error.level === "fatal");
    setStatus(first ? `${first.field}: ${first.message}` : "Save blocked by validation.", "error");
    return;
  }
  previousDraft = current;
  setStatus(`Saved ${current.cardId}. Rows: ${result.report.counts.rows}, warnings: ${result.report.counts.warnings}`, "ok");
  writeForm(blankFromProfile(profileSelect.value));
  form.elements.cardId.focus();
}

function duplicate(includePrivateText) {
  if (!previousDraft) {
    setStatus("No previous card to duplicate.", "error");
    return;
  }
  writeForm({
    ...previousDraft,
    cardId: "",
    privateName: includePrivateText ? previousDraft.privateName : "",
    publicPlaceholderName: includePrivateText ? previousDraft.publicPlaceholderName : "",
    rawEffectTextPrivate: includePrivateText ? previousDraft.rawEffectTextPrivate : "",
    effectOpsJson: includePrivateText ? previousDraft.effectOpsJson : "",
    implemented: "false",
    tested: "false"
  });
  form.elements.cardId.focus();
}

document.querySelector("#save").addEventListener("click", saveDraft);
document.querySelector("#duplicate-safe").addEventListener("click", () => duplicate(false));
document.querySelector("#duplicate-full").addEventListener("click", () => duplicate(true));
document.querySelector("#validate-all").addEventListener("click", async () => {
  const report = await (await fetch("/api/validate")).json();
  setStatus(`Validation: rows=${report.counts.rows}, fatal=${report.counts.fatal}, warnings=${report.counts.warnings}`, report.counts.fatal ? "error" : "ok");
});
profileSelect.addEventListener("change", () => writeForm(blankFromProfile(profileSelect.value)));
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    saveDraft();
  }
  if (event.ctrlKey && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicate(event.shiftKey);
  }
});

loadSession().catch((error) => setStatus(error.message, "error"));
```

- [ ] **Step 4: Start the local entry server**

Run: `npm run cards:entry`

Expected output includes: `Private card entry desk: http://localhost:4177`.

- [ ] **Step 5: Manual keyboard smoke test**

Open `http://localhost:4177`. Use only the keyboard to:

- Select `Commons > Classics`.
- Enter `card_id`, private name, placeholder name, suit, type, start, VP mode, raw text.
- Press `Ctrl+Enter`.
- Confirm the status shows `Saved <card_id>`.
- Press `Ctrl+D`.
- Confirm private name and raw private text are blank while structural fields are copied.

- [ ] **Step 6: Commit**

```bash
git add tools/card-entry/public/index.html tools/card-entry/public/app.js tools/card-entry/public/styles.css
git commit -m "Add private card entry browser UI"
```

## Task 6: Documentation

**Files:**
- Modify: `imperium-like-digital-prototype/docs/private-card-data-workflow.md`

- [ ] **Step 1: Update the workflow doc**

Add this section after "Card data workflow":

````md
## Keyboard transcription desk

For physical card entry, use the local keyboard-first transcription desk:

```sh
npm run cards:entry
```

Then open `http://localhost:4177`.

The desk writes to `private-card-data/imperium_cards_private.csv` and keeps using the existing CSV header from `private-card-data/card-data-template.csv`.

Recommended flow:

1. Choose a Commons batch profile and enter Commons cards first.
2. Use `Ctrl+Enter` to save the current card and move to the next blank card.
3. Use `Ctrl+D` to duplicate safe structure from the previous card without copying private text.
4. Use `Ctrl+Shift+D` only when intentionally copying private text for a variant or near-duplicate.
5. Leave `effect_ops_json` blank during the identity/raw-text pass unless the effect is already obvious.
6. Run `npm run cards:validate -- --input private-card-data/imperium_cards_private.csv` after each batch.

Nation deck entry can happen in any nation order. Create one nation batch at a time and use the nation ID as `set_or_nation`.
````

- [ ] **Step 2: Run docs-adjacent verification**

Run: `npm run cards:validate -- --input private-card-data/card-data-template.csv`

Expected: PASS or warnings only. The command verifies the existing documented validator command is still valid against the template rows.

- [ ] **Step 3: Commit**

```bash
git add docs/private-card-data-workflow.md
git commit -m "Document keyboard private card entry"
```

## Task 7: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run engine tests**

Run: `npm run test -w engine`

Expected: PASS.

- [ ] **Step 2: Run workspace typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run entry server smoke check**

Run: `npm run cards:entry`

Expected: server starts and prints `Private card entry desk: http://localhost:4177`.

- [ ] **Step 4: Verify gitignored private output behavior**

After saving a throwaway card through the UI, run:

```bash
git status --short private-card-data generated-private
```

Expected: no tracked private CSV or generated private JSON files appear. If a private file appears as untracked, confirm `.gitignore` covers it before committing any code.

- [ ] **Step 5: Final commit if any verification-only fixes were needed**

```bash
git add package.json tools/card-entry docs/private-card-data-workflow.md engine/src/tests/cardEntryProfiles.test.ts engine/src/tests/cardEntryCsvStore.test.ts engine/src/tests/cardEntryService.test.ts
git commit -m "Finalize keyboard private card entry"
```

Skip this commit if all prior commits already contain the final state.

## Self-Review

- Spec coverage: The plan covers keyboard-first entry, commons-first profiles, nation profile support, one-card form, safe duplicate behavior, existing CSV output, validator reuse, local-only writes, and docs.
- Scope: The plan starts with card data only and leaves nation/ruleset/bot table entry outside this implementation, matching the spec.
- Privacy: The tool writes only to `private-card-data/imperium_cards_private.csv` and never changes public/demo rendering.
- Type consistency: Draft fields use camelCase in the UI/service layer and convert to existing snake_case CSV fields through `draftToCsvRow`.
