import { useEffect, useMemo, useState } from "react";
import { applyCampaignResult } from "../../../../engine/src/game/campaign";
import type { CampaignCardChoice, CampaignGameOutcome, CampaignProgress } from "../../../../engine/src/options/gameOptions";
import type { AccountGameResultInput } from "../../onlineSession";

type ResourceMap = Record<string, number | undefined>;
export type AccountGameResultContext = {
  historyEntryID: string;
  playerID: string;
  scope: "solo" | "online";
  variant: "standard" | "campaign" | "practice" | "multiplayer";
};

const PLAYER_CARD_ZONES = ["hand", "deck", "discard", "playArea", "history", "exile", "powerArea", "stateArea", "developmentArea", "nationDeck"];
const BOT_CARD_ZONES = ["botDeck", "botDiscard", "botPlayArea", "botHistory"];
const CAMPAIGN_CARD_ZONES = ["hand", "deck", "discard", "playArea", "history", "exile"];

function titleWords(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/:/g, ": ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function playerLabel(playerId: string): string {
  return playerId.startsWith("bot_") ? "Bot" : `Player ${playerId}`;
}

function zoneCardCount(entity: Record<string, any> | undefined, zones: string[]): number {
  if (!entity) return 0;
  return zones.reduce((total, zone) => total + (Array.isArray(entity[zone]) ? entity[zone].length : 0), 0);
}

function resourceTotal(resources: ResourceMap | undefined): number {
  return Object.values(resources ?? {}).reduce<number>((total, value) => total + Number(value ?? 0), 0);
}

function numericRecord(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => typeof entry === "number");
  return entries.length > 0 ? Object.fromEntries(entries) as Record<string, number> : undefined;
}

function nationIdForPlayer(G: any, playerId: string | undefined): string | undefined {
  if (!playerId) return undefined;
  const report = (G?.rulesetReports ?? []).find((entry: any) => String(entry?.playerId) === playerId);
  return typeof report?.nationId === "string" ? report.nationId : undefined;
}

export function accountGameResultFromSummary({
  G,
  historyEntryID,
  playerID,
  scope,
  variant
}: {
  G: any;
  historyEntryID: string;
  playerID: string;
  scope: "solo" | "online";
  variant: "standard" | "campaign" | "practice" | "multiplayer";
}): AccountGameResultInput {
  const gameover = G?.gameover ?? {};
  const winnerID = typeof gameover.winner === "string" ? gameover.winner : String(gameover.winner ?? "");
  const player = G?.players?.[playerID];
  const resources = numericRecord(player?.resources);
  const nationID = nationIdForPlayer(G, playerID);
  const opponentNationIDs = (G?.rulesetReports ?? [])
    .filter((entry: any) => String(entry?.playerId) !== playerID && typeof entry?.nationId === "string")
    .map((entry: any) => entry.nationId);

  return {
    id: historyEntryID,
    outcome: winnerID ? (winnerID === playerID ? "win" : "loss") : "unfinished",
    winnerID: winnerID || undefined,
    winnerNationID: nationIdForPlayer(G, winnerID),
    reason: typeof gameover.reason === "string" ? gameover.reason : undefined,
    scores: numericRecord(gameover.scores),
    tieBreakScores: numericRecord(gameover.tieBreakScores),
    roundsPlayed: typeof G?.round === "number" ? G.round : undefined,
    finalResources: resources,
    finalDeckSize: Array.isArray(player?.deck) ? player.deck.length : undefined,
    finalCardsInPlay: Array.isArray(player?.playArea) ? player.playArea.length : undefined,
    finalUnrest: Number(resources?.unrest ?? 0),
    finalFame: Number(resources?.fame ?? 0),
    rawSummaryStats: {
      scope,
      variant,
      nationID,
      opponentNationIDs
    }
  };
}

function botCardCount(bot: Record<string, any> | undefined): number {
  if (!bot) return 0;
  const zoneCount = zoneCardCount(bot, BOT_CARD_ZONES);
  const slotCount = Object.values(bot.slots ?? {}).filter((slot: any) => typeof slot?.cardId === "string" && slot.cardId.length > 0).length;
  return zoneCount + slotCount;
}

function uniqueCardIds(cardIds: string[]): string[] {
  return [...new Set(cardIds)];
}

function playerCampaignCardIds(G: any, playerId: string | undefined): string[] {
  const player = playerId ? G?.players?.[playerId] : undefined;
  if (!player) return [];
  return uniqueCardIds(CAMPAIGN_CARD_ZONES.flatMap((zone) => Array.isArray(player[zone]) ? player[zone] : []));
}

function cardLabel(G: any, cardId: string): string {
  return G?.cardDb?.[cardId]?.displayName ?? titleWords(cardId);
}

function isCommonsCard(G: any, cardId: string): boolean {
  const card = G?.cardDb?.[cardId];
  return card?.ownership === "commons" || card?.commonsSetId || card?.startingLocation === "market";
}

function campaignChoiceLabel(G: any, choice: CampaignCardChoice): string {
  if (choice.kind === "add_gained_commons_to_starting_deck") return `Add ${cardLabel(G, choice.cardId)}`;
  if (choice.kind === "remove_starting_deck_card") return `Remove ${cardLabel(G, choice.cardId)}`;
  if (choice.kind === "set_aside_commons_card") return `Set Aside ${cardLabel(G, choice.cardId)}`;
  return `Return ${cardLabel(G, choice.cardId)}`;
}

function choicesEqual(a: CampaignCardChoice | undefined, b: CampaignCardChoice | undefined): boolean {
  return Boolean(a && b && a.kind === b.kind && a.cardId === b.cardId);
}

function campaignChoicesForSummary(G: any, progress: CampaignProgress | undefined, outcome: CampaignGameOutcome | undefined): CampaignCardChoice[] {
  if (!progress || !outcome) return [];
  if (!outcome.won) {
    return progress.setAsideCommonsCardIds.map((cardId) => ({ kind: "return_set_aside_commons_card", cardId }));
  }

  const cardIds = playerCampaignCardIds(G, outcome.humanPlayerId);
  if (progress.mode === "supreme_ruler") {
    return cardIds
      .filter((cardId) => isCommonsCard(G, cardId) && !progress.setAsideCommonsCardIds.includes(cardId))
      .map((cardId) => ({ kind: "set_aside_commons_card", cardId }));
  }

  const addChoices = cardIds
    .filter((cardId) => isCommonsCard(G, cardId) && !progress.startingDeckAdditions.includes(cardId))
    .map((cardId) => ({ kind: "add_gained_commons_to_starting_deck" as const, cardId }));
  const removeChoices = cardIds
    .filter((cardId) => !progress.startingDeckRemovals.includes(cardId))
    .map((cardId) => ({ kind: "remove_starting_deck_card" as const, cardId }));
  return [...addChoices, ...removeChoices];
}

export function completeCampaignProgressFromSummary(
  progress: CampaignProgress,
  outcome: CampaignGameOutcome,
  choice?: CampaignCardChoice
): CampaignProgress {
  const result = { ...outcome.result, ...(choice ? { choice } : {}) };
  if (outcome.requiresCampaignChoice && !result.choice) {
    throw new Error("Campaign outcome requires a reward choice before progress can be updated.");
  }
  return applyCampaignResult(progress, result);
}

export function campaignSheetExportText(progress: CampaignProgress): string {
  return JSON.stringify({
    campaignSheetVersion: 1,
    progress
  }, null, 2);
}

function campaignRecordLabel(record: { won: boolean; botNationId: string; difficulty: string; score?: number }, index: number): string {
  const result = record.won ? "Win" : "Loss";
  const score = typeof record.score === "number" ? ` / ${record.score}` : "";
  return `Game ${index + 1}: ${result} vs ${titleWords(record.botNationId)} (${titleWords(record.difficulty)}${score})`;
}

export default function EndGameSummary({
  G,
  onReviewBoard,
  campaignProgress,
  onCampaignProgress,
  accountResultContext,
  onAccountGameResult
}: {
  G: any;
  ctx?: any;
  onReviewBoard?: () => void;
  campaignProgress?: CampaignProgress;
  onCampaignProgress?: (progress: CampaignProgress) => void;
  accountResultContext?: AccountGameResultContext;
  onAccountGameResult?: (result: AccountGameResultInput) => void;
}) {
  const gameover = G?.gameover;
  const [reportedAccountResultKey, setReportedAccountResultKey] = useState<string | undefined>(undefined);
  const campaignOutcome = gameover?.campaignOutcome as CampaignGameOutcome | undefined;
  const activeCampaignProgress = campaignProgress ?? G?.options?.campaignProgress;
  const campaignChoices = useMemo(
    () => campaignChoicesForSummary(G, activeCampaignProgress, campaignOutcome),
    [G, activeCampaignProgress, campaignOutcome]
  );
  const [selectedCampaignChoice, setSelectedCampaignChoice] = useState<CampaignCardChoice | undefined>(campaignChoices[0]);
  const activeCampaignChoice = campaignChoices.find((choice) => choicesEqual(choice, selectedCampaignChoice)) ?? campaignChoices[0];
  const campaignCanUpdate = Boolean(
    activeCampaignProgress
    && campaignOutcome
    && (!campaignOutcome.requiresCampaignChoice || activeCampaignChoice || campaignOutcome.result.choice)
  );
  const previewCampaignProgress = activeCampaignProgress && campaignOutcome && campaignCanUpdate
    ? completeCampaignProgressFromSummary(activeCampaignProgress, campaignOutcome, activeCampaignChoice)
    : undefined;
  const campaignComplete = previewCampaignProgress?.complete;
  const scores = gameover?.scores ?? {};
  const tieBreakScores = gameover?.tieBreakScores ?? {};
  const playerEntries = Object.entries(G?.players ?? {}) as Array<[string, any]>;
  const bot = G?.solo?.bot;

  useEffect(() => {
    if (!gameover || !accountResultContext || !onAccountGameResult) return;
    const key = `${accountResultContext.historyEntryID}:${String(gameover.winner ?? "")}:${String(gameover.reason ?? "")}`;
    if (reportedAccountResultKey === key) return;
    setReportedAccountResultKey(key);
    onAccountGameResult(accountGameResultFromSummary({
      G,
      ...accountResultContext
    }));
  }, [G, accountResultContext, gameover, onAccountGameResult, reportedAccountResultKey]);

  return <section className="panel end-game-summary">
    <div className="eyebrow">Game Complete</div>
    <h2>{gameover?.winner ? `Winner: ${playerLabel(String(gameover.winner))}` : "Game Complete"}</h2>
    <p>{titleWords(String(gameover?.reason ?? "complete"))}</p>

    <div className="score-list">
      {Object.entries(scores).map(([playerId, score]) => <div key={playerId} className="score-row">
        <span>{playerLabel(playerId)}</span>
        <strong>{String(score)}</strong>
        {tieBreakScores[playerId] !== undefined ? <small>Tie-break {String(tieBreakScores[playerId])}</small> : null}
      </div>)}
    </div>

    <div className="summary-stats">
      <div><span>Rounds Played</span><strong>{String(G?.round ?? 0)}</strong></div>
      <div><span>Log Events</span><strong>{String((G?.log ?? []).length)}</strong></div>
      {playerEntries.map(([playerId, player]) => <div key={`${playerId}-cards`}><span>{playerLabel(playerId)} Cards</span><strong>{String(zoneCardCount(player, PLAYER_CARD_ZONES))}</strong></div>)}
      {playerEntries.map(([playerId, player]) => <div key={`${playerId}-resources`}><span>{playerLabel(playerId)} Resources</span><strong>{String(resourceTotal(player.resources))}</strong></div>)}
      {bot ? <div><span>Bot Cards</span><strong>{String(botCardCount(bot))}</strong></div> : null}
    </div>

    {campaignOutcome ? <div className="campaign-summary">
      <div className="eyebrow">Campaign</div>
      <div className="score-row">
        <span>{campaignOutcome.won ? "Won" : "Lost"} vs {titleWords(campaignOutcome.botNationId)}</span>
        <strong>{titleWords(campaignOutcome.scoreKind)}</strong>
        <small>{titleWords(campaignOutcome.difficulty)} / score {campaignOutcome.score}{campaignOutcome.botScore !== undefined ? `-${campaignOutcome.botScore}` : ""}</small>
      </div>
      {campaignChoices.length > 0 ? <div className="campaign-choice-list">
        {campaignChoices.map((choice) => <button
          key={`${choice.kind}:${choice.cardId}`}
          type="button"
          className={choicesEqual(choice, activeCampaignChoice) ? "is-selected" : undefined}
          onClick={() => setSelectedCampaignChoice(choice)}
        >
          {campaignChoiceLabel(G, choice)}
        </button>)}
      </div> : null}
      {previewCampaignProgress ? <div className="summary-stats">
        <div><span>Campaign Wins</span><strong>{String(previewCampaignProgress.wins)}</strong></div>
        <div><span>Campaign Losses</span><strong>{String(previewCampaignProgress.losses)}</strong></div>
        <div><span>Next Difficulty</span><strong>{titleWords(previewCampaignProgress.currentDifficulty)}</strong></div>
      </div> : null}
      {previewCampaignProgress && campaignComplete ? <div className="campaign-complete">
        <div className="eyebrow">Campaign Complete</div>
        <h3>Campaign {titleWords(campaignComplete)}</h3>
        <div className="summary-stats">
          <div><span>Games Played</span><strong>{String(previewCampaignProgress.wins + previewCampaignProgress.losses)}</strong></div>
          <div><span>Final Record</span><strong>{previewCampaignProgress.wins}-{previewCampaignProgress.losses}</strong></div>
          <div><span>Bots Defeated</span><strong>{String(previewCampaignProgress.defeatedBotNationIds.length)}</strong></div>
          <div><span>Starting Deck Changes</span><strong>{String(previewCampaignProgress.startingDeckAdditions.length + previewCampaignProgress.startingDeckRemovals.length)}</strong></div>
        </div>
        {previewCampaignProgress.records?.length ? <div className="campaign-record-list">
          {previewCampaignProgress.records.map((record, index) => <span key={`${record.botNationId}:${index}`}>
            {campaignRecordLabel(record, index)}
          </span>)}
        </div> : null}
      </div> : null}
      {previewCampaignProgress ? <div className="campaign-export">
        <div className="eyebrow">{campaignComplete ? "Final Campaign Sheet" : "Campaign Sheet Export"}</div>
        <textarea
          aria-label="Campaign sheet export"
          readOnly
          value={campaignSheetExportText(previewCampaignProgress)}
        />
      </div> : null}
      {activeCampaignProgress && campaignOutcome && !campaignComplete ? <button
        type="button"
        disabled={!campaignCanUpdate}
        onClick={() => {
          if (!campaignCanUpdate || !previewCampaignProgress) return;
          onCampaignProgress?.(previewCampaignProgress);
        }}
      >
        Update Campaign
      </button> : null}
    </div> : null}

    <button type="button" onClick={onReviewBoard}>Review Board</button>
  </section>;
}
