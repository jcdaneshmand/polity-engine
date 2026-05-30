import path from "node:path";
import type { CardImportReport, PrivateCardCsvRow } from "../card-import/cardCsvTypes";
import { validatePrivateCardsRows } from "../card-import/validatePrivateCards";
import { commonsBatchProfiles } from "./batchProfiles";
import { createBlankCardDraft, draftToCsvRow } from "./cardDraft";
import { appendOrReplaceCardRow, loadCardCsvRows, writeCardCsvRows } from "./cardCsvStore";
import type { CardEntryBatchProfile, CardEntryDraft } from "./cardEntryTypes";

export type CardEntrySession = {
  csvPath: string;
  rows: PrivateCardCsvRow[];
  profiles: CardEntryBatchProfile[];
  draft: CardEntryDraft;
};

export type SaveDraftResult = {
  ok: boolean;
  report: CardImportReport;
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

    validateAll(): CardImportReport {
      return validatePrivateCardsRows(getRows());
    }
  };
}
