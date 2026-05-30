import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  appendOrReplaceCardRow,
  loadCardCsvRows,
  readCardTemplateHeader,
  writeCardCsvRows
} from "../../../tools/card-entry/cardCsvStore";

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
      rows: [
        {
          card_id: "a",
          public_placeholder_name: "A",
          suit: "none",
          card_type: "action",
          starting_location: "market",
          vp_mode: "none",
          implemented: "false",
          tested: "false"
        }
      ]
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
