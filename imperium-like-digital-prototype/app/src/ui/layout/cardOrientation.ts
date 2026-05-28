export type CardOrientation = "portrait" | "landscape";
export type CardPlacementContext =
  | "hand" | "market" | "deck" | "discard" | "play_area" | "history" | "development_area" | "nation_deck" | "power_area" | "state_area" | "detail_zoom";

export function getCardOrientation(args: { card: any; zone: CardPlacementContext }): CardOrientation {
  const { card, zone } = args;
  const byZone = card?.preferredOrientationsByZone?.[zone];
  if (byZone) return byZone;
  if (zone === "play_area") {
    const landscapeTypes = ["in_play", "region", "power", "state", "trade_route"];
    if (card?.inPlayOrientation) return card.inPlayOrientation;
    if (landscapeTypes.includes(card?.cardType) && card?.defaultOrientation === "landscape") return "landscape";
    return "portrait";
  }
  if (zone === "power_area" || zone === "state_area") {
    return card?.defaultOrientation === "landscape" ? "landscape" : "portrait";
  }
  return card?.defaultOrientation ?? "portrait";
}
