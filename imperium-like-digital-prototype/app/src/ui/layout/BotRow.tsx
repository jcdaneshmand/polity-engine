import { CardTile } from "../components/CardTile";
import { PileTile } from "../components/PileTile";
import { getBotPiles } from "./uiSelectors";
import { resourceLabel, type ResourceLabels } from "./resourceDisplay";

export function BotRow({ bot, cardDb, selectedId, resourceLabels = {}, onSelectZone }: { bot: any; cardDb: Record<string, any>; selectedId?: string; resourceLabels?: ResourceLabels; onSelectZone: (id: string) => void }) {
  if (!bot) return null;
  const slots = Object.values(bot.slots ?? {}) as any[];
  const currentStateTokens = bot.stateTokens?.[bot.botStateTableId] ?? {};
  return <section className="panel bot-row">
    <div className="bot-header">
      <div>
        <div className="eyebrow">Solo Bot</div>
        <strong>{bot.botNationId}</strong>
      </div>
      <span>State {bot.botStateSide} - {bot.difficulty}</span>
    </div>
    {Object.keys(currentStateTokens).length ? <div className="bot-piles">
      {Object.entries(currentStateTokens).map(([resource, value]) => <PileTile key={resource} label={`${resourceLabel(resource, resourceLabels)} on state`} count={Number(value)} />)}
    </div> : null}
    <div className="bot-piles">
      {getBotPiles(bot).map((pile) => <PileTile key={pile.id} label={pile.label} count={pile.count} selected={selectedId === pile.id} onSelect={() => onSelectZone(pile.id)} />)}
    </div>
    <div className="bot-slots">
      {slots.map((slot) => {
        const card = slot.cardId ? cardDb[slot.cardId] ?? { id: slot.cardId, displayName: slot.cardId, type: "bot", tags: [], effects: [] } : null;
        return <div className="bot-slot" key={slot.slotNumber}>
          <div className="slot-label">Bot Slot {slot.slotNumber}</div>
          <CardTile card={card} compact orientation="portrait" />
        </div>;
      })}
    </div>
  </section>;
}
