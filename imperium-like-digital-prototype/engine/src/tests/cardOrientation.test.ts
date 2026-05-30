import { describe, expect, it } from "vitest";
import { getCardOrientation } from "../../../app/src/ui/layout/cardOrientation";
import { CardTile } from "../../../app/src/ui/components/CardTile";
import { CardDetailPanel, formatCardDetailEffect, formatCardDetailResourceCost } from "../../../app/src/ui/layout/CardDetailPanel";
import { BotRow } from "../../../app/src/ui/layout/BotRow";
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
  it("CardDetailPanel formats costs and effects for players", () => {
    expect(formatCardDetailResourceCost({ materials:2, knowledge:1, goods:0 })).toBe("2 Materials, 1 Progress");
    expect(formatCardDetailEffect({ trigger:"on_play", op:"gain_resource", resource:"materials", amount:2 })).toBe("On play: gain 2 Materials.");
    expect(formatCardDetailEffect({ trigger:"on_solstice", op:"draw", count:1 })).toBe("On solstice: draw 1 card.");
  });
  it("BotRow hides face-down slot card identities", () => {
    const html = renderToStaticMarkup(BotRow({
      bot:{botNationId:"bot",botStateSide:"A",difficulty:"normal",slots:{1:{slotNumber:1,cardId:"secret_bot_card",face:"down"}}},
      cardDb:{secret_bot_card:{id:"secret_bot_card",displayName:"Secret Bot Card",effects:[],tags:[]}},
      onSelectZone:()=>{}
    } as any));
    expect(html).toContain("Face Down");
    expect(html).not.toContain("Secret Bot Card");
  });
  it("BotRow shows the Bot card that was just revealed from a slot", () => {
    const html = renderToStaticMarkup(BotRow({
      bot:{
        botNationId:"bot",
        botStateSide:"A",
        difficulty:"normal",
        revealedSlotCard:{slotNumber:1,cardId:"secret_bot_card"},
        slots:{1:{slotNumber:1,cardId:"refill_bot_card",face:"down"}}
      },
      cardDb:{
        secret_bot_card:{id:"secret_bot_card",displayName:"Secret Bot Card",effects:[],tags:[]},
        refill_bot_card:{id:"refill_bot_card",displayName:"Refill Bot Card",effects:[],tags:[]}
      },
      onSelectZone:()=>{}
    } as any));
    expect(html).toContain("Revealed from Slot 1");
    expect(html).toContain("Secret Bot Card");
    expect(html).not.toContain("Refill Bot Card");
  });
});
