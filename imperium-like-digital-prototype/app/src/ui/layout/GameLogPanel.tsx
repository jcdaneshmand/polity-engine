import { useEffect, useState } from "react";

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function titleWords(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sentenceWords(value: string): string {
  const words = titleWords(value);
  return words ? words[0].toUpperCase() + words.slice(1).toLowerCase() : value;
}

function cardName(cardId: string): string {
  if (cardId.startsWith("[") && cardId.endsWith("]")) return cardId;
  return titleWords(cardId.replace(/^test_action_/, "").replace(/^test_/, ""));
}

function formatKeyValues(raw: string): string {
  return raw
    .split(/[\/,]/)
    .map((part) => {
      const [key, value] = part.split("=");
      if (value === undefined) return titleWords(part);
      return `${sentenceWords(key)} ${value.replace(/_/g, " ")}`;
    })
    .join(", ");
}

export function formatLogMessage(message: string): string {
  const market = message.match(/^MarketInitialized\(slots=(\d+)\)$/);
  if (market) return `Market initialized with ${plural(Number(market[1]), "card")}.`;

  const cleanupMarketResource = message.match(/^CleanupMarketResourceChoicePending\(options=\d+\)$/);
  if (cleanupMarketResource) return "Choose a market card for the cleanup resource.";

  const cleanupDraw = message.match(/^TurnPhase\(cleanup\): draw_up\(hand=(\d+)\)$/);
  if (cleanupDraw) return `Cleanup: drew up to ${plural(Number(cleanupDraw[1]), "card")} in hand.`;

  const setupDelayed = message.match(/^Setup report delayed=(\d+)$/);
  if (setupDelayed) return Number(setupDelayed[1]) === 0 ? "Setup complete: no delayed aggressive cards." : `Setup complete: ${plural(Number(setupDelayed[1]), "delayed aggressive card")}.`;

  const fame = message.match(/^Fame cards: (\d+)$/);
  if (fame) return `Fame deck has ${plural(Number(fame[1]), "card")}.`;

  const marketDecks = message.match(/^MarketDecks\((.+)\)$/);
  if (marketDecks) return `Market decks: ${formatKeyValues(marketDecks[1])}.`;

  const commonsPath = message.match(/^CommonsDeckConstructionPath\((.+)\)$/);
  if (commonsPath) return `Commons deck construction: ${sentenceWords(commonsPath[1])}.`;

  const playedCard = message.match(/^TurnPhase\(action_execution\): playCard\((.+)\)$/);
  if (playedCard) return `Played ${cardName(playedCard[1])}.`;

  const turnPhase = message.match(/^TurnPhase\(([^)]+)\): (.+)$/);
  if (turnPhase) return `${sentenceWords(turnPhase[1])}: ${sentenceWords(turnPhase[2])}.`;

  const coded = message.match(/^([A-Za-z]+)\((.*)\)$/);
  if (coded) return `${titleWords(coded[1])}: ${formatKeyValues(coded[2])}.`;

  return message
    .replace(/\bknowledge\b/g, "Progress")
    .replace(/\binfluence\b/g, "Population")
    .replace(/\bmaterials\b/g, "Materials")
    .replace(/\bgoods\b/g, "Goods")
    .replace(/\bunrest\b/g, "Unrest");
}

function formatPlayerId(playerId: string): string {
  if (playerId === "setup") return "Setup";
  if (playerId === "scoring") return "Scoring";
  if (playerId === "collapse") return "Collapse";
  return `Player ${playerId}`;
}

export function GameLogPanel({ entries }: { entries: any[] }) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!panel) return;
    requestAnimationFrame(() => {
      panel.scrollTop = panel.scrollHeight;
    });
  }, [panel, entries.length, entries.at(-1)?.message]);

  return (
    <section className="panel log-panel" ref={setPanel} aria-label="Game log" data-qa="game-log">
      <div className="panel-title">Game Log</div>
      {entries.length === 0
        ? <div>No log entries.</div>
        : entries.map((e, i) => (
          <div key={i}>
            <span className="log-prefix">Round {e.round} - {formatPlayerId(String(e.playerId))}</span>
            <span>{formatLogMessage(String(e.message))}</span>
          </div>
        ))}
    </section>
  );
}

export function summarizeLastLogEntry(entries: any[]): string | undefined {
  const entry = entries.at(-1);
  if (!entry) return undefined;
  return formatLogMessage(String(entry.message ?? ""));
}
