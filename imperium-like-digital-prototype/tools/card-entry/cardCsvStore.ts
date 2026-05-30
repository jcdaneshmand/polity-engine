import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { PrivateCardCsvRow } from "../card-import/cardCsvTypes";
import { parseCsvFile } from "../card-import/csvParser";

type PapaWithUnparse = typeof Papa & {
  unparse: (rows: PrivateCardCsvRow[], config: { columns: string[]; newline: string }) => string;
};

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
  return rows.map((existing, existingIndex) => (existingIndex === index ? row : existing));
}

export function writeCardCsvRows(args: { filePath: string; templatePath: string; rows: PrivateCardCsvRow[] }) {
  const fields = readCardTemplateHeader(args.templatePath);
  const normalizedRows = args.rows.map((row) => {
    const normalized: PrivateCardCsvRow = {};
    for (const field of fields) normalized[field] = row[field] ?? "";
    return normalized;
  });

  fs.mkdirSync(path.dirname(args.filePath), { recursive: true });
  fs.writeFileSync(args.filePath, `${(Papa as PapaWithUnparse).unparse(normalizedRows, { columns: fields, newline: "\n" })}\n`, "utf8");
}
