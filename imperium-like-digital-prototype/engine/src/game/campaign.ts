import type { CampaignMode, CampaignProgress, CampaignGameRecord, ExpansionId, SoloDifficulty } from "../options/gameOptions";
import type { ResourceName } from "./state";

const STANDARD_DIFFICULTIES: SoloDifficulty[] = ["chieftain", "warlord", "imperator", "sovereign", "overlord"];

export function createCampaignProgress(args: {
  mode: CampaignMode;
  playerNationId: string;
  startingDifficulty?: SoloDifficulty;
}): CampaignProgress {
  const currentDifficulty = args.mode === "supreme_ruler"
    ? "supreme_ruler"
    : args.startingDifficulty ?? "chieftain";
  return {
    mode: args.mode,
    playerNationId: args.playerNationId,
    wins: 0,
    losses: 0,
    currentDifficulty,
    defeatedBotNationIds: [],
    startingDeckAdditions: [],
    startingDeckRemovals: [],
    setAsideCommonsCardIds: [],
    doubleStartingResourcesForNextGame: false,
    records: []
  };
}

export function canCampaignPlayAgainstBot(progress: CampaignProgress, botNationId: string): boolean {
  return !progress.defeatedBotNationIds.includes(botNationId);
}

export function nextStandardCampaignDifficulty(difficulty: SoloDifficulty): SoloDifficulty {
  const index = STANDARD_DIFFICULTIES.indexOf(difficulty);
  if (index < 0) return "chieftain";
  return STANDARD_DIFFICULTIES[Math.min(index + 1, STANDARD_DIFFICULTIES.length - 1)];
}

export function campaignStartingResourceOverride(
  progress: CampaignProgress | undefined,
  enabledExpansions: readonly ExpansionId[]
): Record<Exclude<ResourceName, "unrest">, number> | undefined {
  if (!progress?.doubleStartingResourcesForNextGame) return undefined;
  const tradeRoutesEnabled = enabledExpansions.includes("trade_routes");
  return {
    materials: 6,
    influence: 4,
    knowledge: tradeRoutesEnabled ? 0 : 2,
    goods: tradeRoutesEnabled ? 2 : 0
  };
}

export function applyCampaignResult(progress: CampaignProgress, result: CampaignGameRecord): CampaignProgress {
  const next: CampaignProgress = {
    ...progress,
    defeatedBotNationIds: [...progress.defeatedBotNationIds],
    startingDeckAdditions: [...progress.startingDeckAdditions],
    startingDeckRemovals: [...progress.startingDeckRemovals],
    setAsideCommonsCardIds: [...progress.setAsideCommonsCardIds],
    records: [...(progress.records ?? []), result],
    complete: progress.complete
  };

  if (result.won) {
    next.wins += 1;
    next.doubleStartingResourcesForNextGame = false;
    if (!next.defeatedBotNationIds.includes(result.botNationId)) next.defeatedBotNationIds.push(result.botNationId);
    applyWinChoice(next, result);
    if (next.wins >= 5) next.complete = "won";
    next.currentDifficulty = progress.mode === "supreme_ruler"
      ? "supreme_ruler"
      : next.complete === "won"
        ? progress.currentDifficulty
        : nextStandardCampaignDifficulty(result.difficulty);
    return next;
  }

  next.losses += 1;
  next.doubleStartingResourcesForNextGame = true;
  if (result.choice?.kind === "return_set_aside_commons_card") {
    next.setAsideCommonsCardIds = next.setAsideCommonsCardIds.filter((cardId) => cardId !== result.choice?.cardId);
  }
  if (next.losses >= 4) next.complete = "lost";
  next.currentDifficulty = progress.mode === "supreme_ruler" ? "supreme_ruler" : progress.currentDifficulty;
  return next;
}

function applyWinChoice(progress: CampaignProgress, result: CampaignGameRecord): void {
  if (!result.choice) return;
  if (result.choice.kind === "add_gained_commons_to_starting_deck" && !progress.startingDeckAdditions.includes(result.choice.cardId)) {
    progress.startingDeckAdditions.push(result.choice.cardId);
  }
  if (result.choice.kind === "remove_starting_deck_card" && !progress.startingDeckRemovals.includes(result.choice.cardId)) {
    progress.startingDeckRemovals.push(result.choice.cardId);
  }
  if (result.choice.kind === "set_aside_commons_card" && !progress.setAsideCommonsCardIds.includes(result.choice.cardId)) {
    progress.setAsideCommonsCardIds.push(result.choice.cardId);
  }
}
