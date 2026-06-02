import type { GameState } from "../../../../engine/src/game/state";

export function getCurrentPlayerId(G: GameState, ctx: any): string {
  return ctx?.currentPlayer ?? Object.keys(G.players ?? {})[0] ?? "0";
}
export function getCurrentPlayer(G: GameState, ctx: any) {
  const id = getCurrentPlayerId(G, ctx);
  return G.players?.[id] ?? null;
}
export function getMarketCards(G: GameState): string[] { return Array.isArray(G.market) ? G.market : []; }
export function getSharedPiles(G: GameState) {
  const fameCount = (G.fameDeck?.available?.length ?? 0) + (G.fameDeck?.specialBottomCardId ? 1 : 0);
  const publicGlobalExileCount = G.globalSpecialZones?.exile?.visibility === "public" ? G.globalSpecialZones.exile.cardIds.length : 0;
  const exileCount = publicGlobalExileCount + Object.values(G.players ?? {}).reduce((sum, player) => sum + (player.exile?.length ?? 0), 0);
  return [
    { id: "region", label: "Region", count: G.marketDecks?.regionDeck?.length ?? 0 },
    { id: "uncivilized", label: "Uncivilized", count: G.marketDecks?.uncivilizedDeck?.length ?? 0 },
    { id: "civilized", label: "Civilized", count: G.marketDecks?.civilizedDeck?.length ?? 0 },
    { id: "main", label: "Main", count: G.marketDecks?.mainDeck?.length ?? G.marketRefillPool?.length ?? 0 },
    { id: "fame", label: "Fame", count: fameCount },
    { id: "unrest", label: "Unrest", count: G.unrestPile?.length ?? 0 },
    { id: "exile", label: "Exile", count: exileCount }
  ];
}
export function getCardById(G: GameState, cardId?: string) { return cardId ? G.cardDb?.[cardId] : undefined; }
function zoneCount(owner: any, zoneId: string): number {
  const direct = owner?.[zoneId];
  const base = Array.isArray(direct) ? direct.length : (Array.isArray(owner?.sideAreas?.[zoneId]) ? owner.sideAreas[zoneId].length : 0);
  if (zoneId === "nationDeck" && owner?.accessionCardId && !(owner?.nationDeck ?? []).includes(owner.accessionCardId)) return base + 1;
  return base;
}
export function getPlayerZoneCounts(player: any) {
  if (!player) return { deck: 0, discard: 0, hand: 0, playArea: 0, history: 0, developmentArea: 0, nationDeck: 0 };
  return {
    deck: player.deck?.length ?? 0, discard: player.discard?.length ?? 0, hand: player.hand?.length ?? 0,
    playArea: player.playArea?.length ?? 0, history: player.history?.length ?? 0,
    developmentArea: player.developmentArea?.length ?? 0, nationDeck: zoneCount(player, "nationDeck")
  };
}
export function getZoneCards(player: any, zoneId: string): string[] {
  const direct = player?.[zoneId];
  if (Array.isArray(direct)) return direct;
  const sideArea = player?.sideAreas?.[zoneId];
  if (Array.isArray(sideArea)) return sideArea;
  return [];
}
export function getInspectableSharedPile(G: GameState, pileId: string): { hidden: boolean; cardIds: string[]; count: number } {
  if (pileId === "fame") {
    const ordinaryCount = G.fameDeck?.available?.length ?? 0;
    const specialId = G.fameDeck?.specialBottomCardId;
    const specialCount = specialId ? 1 : 0;
    const count = ordinaryCount + specialCount;
    if (ordinaryCount === 0 && specialId && G.fameDeck?.specialBottomSide !== "face_down") {
      return { hidden: false, cardIds: [specialId], count };
    }
    return { hidden: true, cardIds: [], count };
  }
  const hiddenMarketDecks: Record<string, string[] | undefined> = {
    region: G.marketDecks?.regionDeck,
    uncivilized: G.marketDecks?.uncivilizedDeck,
    civilized: G.marketDecks?.civilizedDeck,
    main: G.marketDecks?.mainDeck ?? G.marketRefillPool,
    unrest: G.unrestPile
  };
  const marketDeckNameByPile: Record<string, keyof NonNullable<GameState["marketDecks"]>> = {
    region: "regionDeck",
    uncivilized: "uncivilizedDeck",
    civilized: "civilizedDeck"
  };
  const marketDeckName = marketDeckNameByPile[pileId];
  if (marketDeckName) {
    const deck = G.marketDecks?.[marketDeckName] ?? [];
    const bottomCardId = G.marketDeckBottomCards?.[marketDeckName];
    if (bottomCardId && deck[deck.length - 1] === bottomCardId) return { hidden: false, cardIds: [bottomCardId], count: deck.length };
    return { hidden: true, cardIds: [], count: deck.length };
  }
  if (pileId === "exile") {
    const globalExile = G.globalSpecialZones?.exile?.visibility === "public" ? G.globalSpecialZones.exile.cardIds : [];
    const playerExile = Object.values(G.players ?? {}).flatMap((player) => player.exile ?? []);
    const cardIds = [...globalExile, ...playerExile];
    return { hidden: false, cardIds, count: cardIds.length };
  }
  if (hiddenMarketDecks[pileId]) return { hidden: true, cardIds: [], count: hiddenMarketDecks[pileId]?.length ?? 0 };
  const specialZone = G.globalSpecialZones?.[pileId];
  if (specialZone) {
    const cardIds = specialZone.visibility === "public" ? specialZone.cardIds : [];
    return { hidden: specialZone.visibility !== "public", cardIds, count: specialZone.cardIds.length };
  }
  return { hidden: true, cardIds: [], count: 0 };
}
export function getInspectableZone(
  owner: any,
  zoneId: string,
  viewer?: { ownerPlayerId?: string; viewerPlayerId?: string }
): { hidden: boolean; cardIds: string[]; count: number } {
  if (zoneId === "botSlots") {
    const slots = Object.values(owner?.slots ?? {}) as any[];
    return {
      hidden: false,
      cardIds: slots.filter((slot) => slot.face === "up" && slot.cardId).map((slot) => slot.cardId),
      count: slots.filter((slot) => !!slot.cardId).length
    };
  }

  const cardIds = getZoneCards(owner, zoneId);
  if (
    zoneId === "nationDeck"
    && owner?.accessionCardId
    && (
      !(owner?.nationDeck ?? []).includes(owner.accessionCardId)
      || owner?.nationDeck?.at?.(-1) === owner.accessionCardId
    )
  ) {
    return { hidden: false, cardIds: [owner.accessionCardId], count: zoneCount(owner, zoneId) };
  }
  const hiddenZones = new Set(["deck", "nationDeck", "botDeck", "botDynastyDeck"]);
  if (hiddenZones.has(zoneId)) return { hidden: true, cardIds: [], count: zoneCount(owner, zoneId) };
  const ownerVisibleZones = new Set(["hand", "history"]);
  if (
    ownerVisibleZones.has(zoneId) &&
    viewer?.ownerPlayerId !== undefined &&
    viewer?.viewerPlayerId !== undefined &&
    viewer.ownerPlayerId !== viewer.viewerPlayerId
  ) {
    return { hidden: true, cardIds: [], count: cardIds.length };
  }
  return { hidden: false, cardIds, count: cardIds.length };
}
export function getInspectableLookedCards(
  G: GameState,
  viewerPlayerId: string
): { hidden: boolean; source: string; cardIds: string[]; count: number } | undefined {
  const looked = G.lookedCards;
  if (!looked) return undefined;
  const cardIds = looked.playerId === viewerPlayerId ? looked.cardIds : [];
  return {
    hidden: looked.playerId !== viewerPlayerId,
    source: looked.source,
    cardIds,
    count: looked.cardIds.length
  };
}
export function getBotPiles(bot: any) {
  const slots = Object.values(bot?.slots ?? {}).filter((slot: any) => !!slot?.cardId).length;
  return [
    { id: "botDeck", label: "Bot Deck", count: bot?.botDeck?.length ?? 0 },
    { id: "botDynastyDeck", label: "Dynasty", count: bot?.botDynastyDeck?.length ?? 0 },
    { id: "botDiscard", label: "Bot Discard", count: bot?.botDiscard?.length ?? 0 },
    { id: "botHistory", label: "Bot History", count: bot?.botHistory?.length ?? 0 },
    { id: "botPlayArea", label: "Bot Play", count: bot?.botPlayArea?.length ?? 0 },
    { id: "botSlots", label: "Bot Slots", count: slots }
  ];
}
export function getRecentLogEntries(G: GameState, limit = 20) { return (G.log ?? []).slice(-limit); }
