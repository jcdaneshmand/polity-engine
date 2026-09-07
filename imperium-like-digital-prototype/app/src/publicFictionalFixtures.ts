import type { PrivateDataBundle } from "../../engine/src/setup/privateDataBundle";
import cards from "../../data/fictional-regression/cards.json";
import nations from "../../data/fictional-regression/nations.json";
import nationRulesets from "../../data/fictional-regression/rulesets.json";
export { PUBLIC_FICTIONAL_FIXTURE_VERSION } from "./publicFictionalFixtureMetadata";

export function createPublicFictionalFixtureBundle(): PrivateDataBundle {
  return structuredClone({
    cards,
    nations,
    nationRulesets,
    botStateTables: {},
    botTradeRoutesTables: {}
  }) as unknown as PrivateDataBundle;
}

export function publicFictionalCommonsCardIds(bundle: PrivateDataBundle): string[] {
  return (bundle.cards ?? [])
    .filter((card) => (card.ownership ?? "commons") === "commons" && card.commonsSetId === "custom" && (card.commonsGroup ?? "base") !== "replacement")
    .map((card) => card.id);
}
