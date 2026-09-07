import { describe, expect, it } from "vitest";
import { createPublicFictionalFixtureBundle, PUBLIC_FICTIONAL_FIXTURE_VERSION, publicFictionalCommonsCardIds } from "./publicFictionalFixtures";

describe("public fictional fixture bundle", () => {
  it("exposes a versioned synthetic bundle without private fields", () => {
    const bundle = createPublicFictionalFixtureBundle();
    expect(PUBLIC_FICTIONAL_FIXTURE_VERSION).toBe(3);
    expect(bundle.cards?.length).toBeGreaterThan(0);
    expect(bundle.nations?.length).toBeGreaterThan(0);
    expect(bundle.cards?.every((card) => card.id.startsWith("fixture_") && card.rawEffectTextPrivate === undefined)).toBe(true);
    expect(bundle.nations?.every((nation) => nation.id.startsWith("fixture_"))).toBe(true);
    expect(publicFictionalCommonsCardIds(bundle).length).toBeGreaterThan(0);
  });

  it("returns an isolated copy for each browser setup", () => {
    const first = createPublicFictionalFixtureBundle();
    const second = createPublicFictionalFixtureBundle();
    first.cards?.splice(0, 1);
    expect(second.cards?.length).toBeGreaterThan(first.cards?.length ?? 0);
  });
});
