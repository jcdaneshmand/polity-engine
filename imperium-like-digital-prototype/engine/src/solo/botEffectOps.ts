import type { CardType, GameLogEntry, ResourceName } from "../game/state";
import type { Suit } from "../cards/cardTypes";

export type SlotNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type BotAcquireFilter = {
  suits?: Suit[];
  cardTypes?: CardType[];
  tags?: string[];
  minVp?: number;
  maxVp?: number;
  hasMarketResource?: ResourceName;
  slotNumbers?: SlotNumber[];
};

export type BotEffectOp =
  | { op: "bot_return_revealed_card_to_unrest" }
  | { op: "bot_discard_revealed_card" }
  | { op: "bot_put_revealed_card_into_history" }
  | { op: "bot_play_revealed_card" }
  | { op: "bot_put_revealed_card_on_bottom_of_deck" }
  | { op: "bot_gain_resource"; resource: ResourceName; count: number }
  | { op: "bot_gain_resource_per_in_play"; resource: ResourceName; filter?: BotAcquireFilter; countPerCard?: number }
  | { op: "bot_spend_resource"; resource: ResourceName; count: number }
  | { op: "bot_pay_resource_then"; resource: ResourceName; count: number; effects: BotEffectOp[] }
  | { op: "bot_move_resource_to_state_card"; resource: ResourceName; count: number; ifUnable?: BotEffectOp[] }
  | { op: "bot_spend_resource_to_state_card"; spendResource: ResourceName; spendCount: number; placeResource: ResourceName; placeCount: number; ifUnable?: BotEffectOp[] }
  | { op: "bot_take_unrest"; count: number }
  | { op: "human_take_chaos"; count: number; zoneId?: string }
  | { op: "bot_resolve_cultists_state_cleanup" }
  | { op: "bot_gain_fame"; count: number }
  | { op: "bot_acquire"; filter?: BotAcquireFilter; fromExile?: boolean; ifUnable?: BotEffectOp[] }
  | { op: "bot_break_through"; filter?: BotAcquireFilter; resolveGained?: boolean; discardGained?: boolean; ifUnable?: BotEffectOp[] }
  | { op: "bot_resolve_top_bot_deck" }
  | { op: "bot_resolve_top_dynasty_deck" }
  | { op: "bot_resolve_top_main_deck"; ifVp?: { value: number; effects: BotEffectOp[] } }
  | { op: "bot_discard_top_bot_deck"; count?: number; ifUnable?: BotEffectOp[] }
  | { op: "bot_discard_top_dynasty_deck"; count?: number; ifUnable?: BotEffectOp[] }
  | { op: "bot_return_from_discard"; filter?: BotAcquireFilter; ifUnable?: BotEffectOp[] }
  | { op: "bot_recall_in_play"; filter?: BotAcquireFilter; ifUnable?: BotEffectOp[] }
  | { op: "bot_move_top_discard_to_deck" }
  | { op: "bot_add_resource_to_market_slot"; resource: ResourceName; slot: "rolled" | SlotNumber; count: number }
  | { op: "bot_flip_state_table"; nextSide?: string; nextTableId?: string }
  | { op: "bot_flip_merchant_state"; nextState: "merchants" | "merchant_empire" }
  | { op: "bot_trade" }
  | { op: "bot_trigger_trade_route"; cardId?: string }
  | { op: "bot_resolve_profits_where_able" }
  | { op: "human_take_unrest"; count: number }
  | { op: "human_abandon"; filter?: BotAcquireFilter; count?: number }
  | { op: "human_recall"; filter?: BotAcquireFilter; count?: number }
  | { op: "human_gain_resource"; resource: ResourceName; count: number }
  | { op: "log"; message: string };

export type BotOpResult = { resolved: boolean; warnings: string[]; logEntries: GameLogEntry[] };
