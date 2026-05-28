import { describe, expect, it } from "vitest";
import { getCardOrientation } from "../../../app/src/ui/layout/cardOrientation";
import { CardTile } from "../../../app/src/ui/components/CardTile";
import { CardDetailPanel } from "../../../app/src/ui/layout/CardDetailPanel";
import { renderToStaticMarkup } from "react-dom/server";

describe("card orientation", () => {
  const inPlayCard:any = { id:"r1", displayName:"River Hold", cardType:"in_play", inPlayOrientation:"landscape", effects:[] };
  it("hand and market default portrait", () => {
    expect(getCardOrientation({ card: { id:"a" }, zone: "hand" })).toBe("portrait");
    expect(getCardOrientation({ card: { id:"a" }, zone: "market" })).toBe("portrait");
  });
  it("inPlayOrientation landscape in play_area", () => {
    expect(getCardOrientation({ card: inPlayCard, zone: "play_area" })).toBe("landscape");
  });
  it("same card portrait in hand", () => {
    expect(getCardOrientation({ card: inPlayCard, zone: "hand" })).toBe("portrait");
  });
  it("CardTile portrait class", () => {
    const html = renderToStaticMarkup(CardTile({ card:{displayName:"A",effects:[]}, orientation:"portrait" } as any));
    expect(html).toContain("card-tile--portrait");
  });
  it("CardTile landscape class", () => {
    const html = renderToStaticMarkup(CardTile({ card:{displayName:"A",effects:[]}, orientation:"landscape" } as any));
    expect(html).toContain("card-tile--landscape");
  });
  it("CardDetailPanel does not render private fields", () => {
    const html = renderToStaticMarkup(CardDetailPanel({ card:{displayName:"A", privateName:"PrivateX", rawEffectTextPrivate:"secret", effects:[], tags:[]} } as any));
    expect(html).toContain("A");
    expect(html).not.toContain("PrivateX");
    expect(html).not.toContain("secret");
  });
});
