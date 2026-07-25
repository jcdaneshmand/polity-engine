import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scaffoldPrivateCsvSources } from "../../../tools/card-import/scaffoldPrivateCsvSources";

const tmpRoots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "polity-private-scaffold-"));
  tmpRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("private CSV scaffolding", () => {
  it("creates missing private CSV files with only template headers", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "private-card-data"), { recursive: true });
    fs.writeFileSync(path.join(root, "private-card-data/template.csv"), "id,name,notes\nexample,Private Name,Private text\n", "utf8");

    const result = scaffoldPrivateCsvSources({
      root,
      sources: [{
        input: "private-card-data/imperium_cards_private.csv",
        output: "generated-private/cards.normalized.json",
        template: "private-card-data/template.csv"
      }]
    });

    expect(result).toEqual({
      created: ["private-card-data/imperium_cards_private.csv"],
      existing: []
    });
    expect(fs.readFileSync(path.join(root, "private-card-data/imperium_cards_private.csv"), "utf8")).toBe("id,name,notes\n");
  });

  it("leaves existing private CSV files unchanged", () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, "private-card-data"), { recursive: true });
    fs.writeFileSync(path.join(root, "private-card-data/template.csv"), "id,name\n", "utf8");
    fs.writeFileSync(path.join(root, "private-card-data/imperium_cards_private.csv"), "id,name\nexisting,Existing row\n", "utf8");

    const result = scaffoldPrivateCsvSources({
      root,
      sources: [{
        input: "private-card-data/imperium_cards_private.csv",
        output: "generated-private/cards.normalized.json",
        template: "private-card-data/template.csv"
      }]
    });

    expect(result).toEqual({
      created: [],
      existing: ["private-card-data/imperium_cards_private.csv"]
    });
    expect(fs.readFileSync(path.join(root, "private-card-data/imperium_cards_private.csv"), "utf8")).toBe("id,name\nexisting,Existing row\n");
  });
});
