import { describe, expect, it } from "vitest";
import { getBotNationSetupOptions } from "../../../app/src/ui/setup/botNationOptions";

describe("bot nation setup options", () => {
  it("marks nations ready, partial, or missing from bot state table coverage", () => {
    const options = getBotNationSetupOptions(
      [
        { id: "cultists", label: "Cultists" },
        { id: "martians", label: "Martians" },
        { id: "utopians", label: "Utopians" }
      ],
      {
        cultists_S: { id: "cultists", botNationId: "cultists", side: "S", rows: [{ implemented: true, tested: true }] },
        cultists_F: { id: "cultists", botNationId: "cultists", side: "F", rows: [{ implemented: true, tested: true }] },
        martians_S: { id: "martians", botNationId: "martians", side: "S", rows: [{ implemented: true, tested: false }] }
      } as any
    );

    expect(options).toEqual([
      { id: "cultists", label: "Cultists", status: "ready", statusLabel: "Ready" },
      { id: "martians", label: "Martians", status: "partial", statusLabel: "Incomplete bot table" },
      { id: "utopians", label: "Utopians", status: "missing", statusLabel: "Missing bot table" }
    ]);
  });
});
