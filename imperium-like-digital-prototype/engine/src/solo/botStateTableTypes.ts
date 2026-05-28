import type { CardType } from "../game/state";
import type { Suit } from "../cards/cardTypes";
import type { BotEffectOp } from "./botEffectOps";

export type BotRowTrigger =
  | { kind: "card_id"; cardId: string }
  | { kind: "card_name_private"; value: string }
  | { kind: "suit"; suit: Suit }
  | { kind: "card_type"; cardType: CardType }
  | { kind: "tag"; tag: string }
  | { kind: "unrest" }
  | { kind: "other" };

export type BotStateTableRow = {
  id: string;
  priority: number;
  trigger: BotRowTrigger;
  effects: BotEffectOp[];
  privateTriggerLabel?: string;
  privateEffectText?: string;
  publicPlaceholderLabel?: string;
  implemented: boolean;
  tested: boolean;
};

export type BotStateTable = {
  id: string;
  botNationId: string;
  displayName: string;
  privateName?: string;
  side: string;
  rows: BotStateTableRow[];
  publicSummary?: string;
};
