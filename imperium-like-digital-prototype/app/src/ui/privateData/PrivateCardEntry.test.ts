import { describe, expect, it } from "vitest";
import { buildPrivateEntryExportGuidance } from "./PrivateCardEntry";

describe("PrivateCardEntry export guidance", () => {
  it("points saved transcription CSVs at the status command before the strict gate", () => {
    const guidance = buildPrivateEntryExportGuidance({
      cardRows: 12,
      nationRows: 2,
      rulesetRows: 2,
      botStateRows: 4,
      botTradeRows: 3,
      dirty: false,
      fatalCount: 0
    });

    expect(guidance.nextCommand).toBe("private:status private:gate");
    expect(guidance.summary).toContain("Saved CSVs");
    expect(guidance.detail).toContain("npm run private:status");
    expect(guidance.detail).toContain("npm run private:gate");
    expect(guidance.detail).toContain("12 card rows");
    expect(guidance.detail).toContain("2 nation rows");
    expect(guidance.detail).toContain("4 bot state rows");
  });

  it("keeps guidance public-safe when rows are dirty or invalid", () => {
    const guidance = buildPrivateEntryExportGuidance({
      cardRows: 1,
      nationRows: 0,
      rulesetRows: 0,
      botStateRows: 0,
      botTradeRows: 0,
      dirty: true,
      fatalCount: 2
    });

    expect(guidance.summary).toContain("Save or download changed CSVs");
    expect(guidance.detail).toContain("2 fatal validator issues");
    expect(JSON.stringify(guidance)).not.toContain("privateName");
    expect(JSON.stringify(guidance)).not.toContain("rawEffectTextPrivate");
  });
});
