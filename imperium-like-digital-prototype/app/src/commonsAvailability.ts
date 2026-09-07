import type { NormalizedCardRecord } from "../../tools/card-import/cardCsvTypes";
import type { NationDefinition } from "../../engine/src/nations/nationSchema";
import type { CommonsSetId } from "../../engine/src/options/gameOptions";
import { analyzeCommonsSetup, type CommonsSetupAnalysis, type CommonsValidationProfile } from "../../engine/src/setup/commonsAnalysis";
import type { CommonsSetupOptions } from "../../engine/src/setup/commonsTypes";

export type BaseCommonsSetId = Exclude<CommonsSetId, "custom">;
export type BaseSetAvailabilityStatus = "available" | "incomplete" | "no_cards" | "demo";

export type BaseSetAvailability = {
  setId: BaseCommonsSetId;
  status: BaseSetAvailabilityStatus;
  statusLabel: "Available" | "Incomplete" | "No Cards Loaded" | "Demo Data";
  sourceCount: number;
  eligibleCount: number;
  disabled: boolean;
  reason?: string;
  analysis: CommonsSetupAnalysis;
};

const STATUS_LABELS: Record<BaseSetAvailabilityStatus, BaseSetAvailability["statusLabel"]> = {
  available: "Available",
  incomplete: "Incomplete",
  no_cards: "No Cards Loaded",
  demo: "Demo Data"
};

export function analyzeBaseSetAvailability(args: {
  setId: BaseCommonsSetId;
  cardDb: Record<string, NormalizedCardRecord>;
  nationDb: Record<string, NationDefinition>;
  options: Omit<CommonsSetupOptions, "commonsSetId" | "customCommonsCardIds">;
  profile: CommonsValidationProfile;
  randomBotUnresolved?: boolean;
}): BaseSetAvailability {
  const sourceCount = Object.values(args.cardDb).filter((card) =>
    card.ownership === "commons" && card.commonsSetId === args.setId && card.commonsGroup !== "replacement"
  ).length;
  const analysisProfile = args.profile === "builtin_demo" && args.setId === "classics" ? "builtin_demo" : "standard";
  const analysis = analyzeCommonsSetup({
    cardDb: args.cardDb,
    nationDb: args.nationDb,
    options: { ...args.options, commonsSetId: args.setId },
    profile: analysisProfile,
    randomBotUnresolved: args.randomBotUnresolved
  });
  const status: BaseSetAvailabilityStatus = sourceCount === 0
    ? "no_cards"
    : analysisProfile === "builtin_demo" && analysis.status !== "blocked"
      ? "demo"
      : analysis.status === "blocked" ? "incomplete" : "available";
  const blockingReason = analysis.issues.find((issue) => issue.severity === "blocking")?.message;
  return {
    setId: args.setId,
    status,
    statusLabel: STATUS_LABELS[status],
    sourceCount,
    eligibleCount: analysis.counts.selected,
    disabled: status === "no_cards" || status === "incomplete",
    ...(status === "no_cards"
      ? { reason: `No ${args.setId[0].toUpperCase()}${args.setId.slice(1)} Commons cards are loaded.` }
      : blockingReason ? { reason: blockingReason } : {}),
    analysis
  };
}

export function analyzeAllBaseSetAvailability(args: Omit<Parameters<typeof analyzeBaseSetAvailability>[0], "setId">): Record<BaseCommonsSetId, BaseSetAvailability> {
  return Object.fromEntries((["classics", "legends", "horizons"] as const).map((setId) => [setId, analyzeBaseSetAvailability({ ...args, setId })])) as Record<BaseCommonsSetId, BaseSetAvailability>;
}
