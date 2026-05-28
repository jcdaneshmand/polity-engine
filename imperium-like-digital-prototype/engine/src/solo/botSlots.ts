import type { BotSlot, BotState, SlotNumber } from "./botTypes";

export function initializeBotSlots(slotCount: 5 | 6): Record<number, BotSlot> {
  const slots: Record<number, BotSlot> = {};
  for (let i = 1; i <= slotCount; i++) slots[i] = { slotNumber: i as SlotNumber, face: "down" };
  return slots;
}
export function getResolvableBotSlots(bot: BotState): BotSlot[] {
  return Object.values(bot.slots).filter((s) => s.cardId && !s.blockedByDie).sort((a,b)=>a.slotNumber-b.slotNumber);
}
export function revealSlotCard(bot: BotState, slotNumber: SlotNumber): string | undefined { const s=bot.slots[slotNumber]; if (!s?.cardId) return; s.face='up'; return s.cardId; }
export function rollAndBlockSlot(bot: BotState, roll: number): void { bot.lastDieRoll=roll; Object.values(bot.slots).forEach(s=>s.blockedByDie=false); const slot=bot.slots[roll]; if (slot?.cardId){ slot.blockedByDie=true; bot.unresolvedSlot=roll as SlotNumber; } else bot.unresolvedSlot=undefined; }
