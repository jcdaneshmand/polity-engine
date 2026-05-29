import { describe, expect, it } from "vitest";
import { getBotPiles, getCurrentPlayer, getInspectableZone, getMarketCards, getRecentLogEntries, getZoneCards } from "../../../app/src/ui/layout/uiSelectors";

describe("ui selectors",()=>{
  it("handles missing market",()=> expect(getMarketCards({market:null} as any)).toEqual([]));
  it("handles missing log",()=> expect(getRecentLogEntries({log:null} as any, 5)).toEqual([]));
  it("returns current player safely",()=> { const G:any={players:{"0":{id:0}}}; expect(getCurrentPlayer(G,{currentPlayer:"0"})).toEqual({id:0}); });
  it("returns empty arrays instead of throwing",()=> expect(()=>getMarketCards({} as any)).not.toThrow());
  it("returns cards for a selected player zone",()=> {
    const player:any={deck:["a"],nationDeck:["n1"],sideAreas:{vault:["v1"]}};
    expect(getZoneCards(player,"deck")).toEqual(["a"]);
    expect(getZoneCards(player,"nationDeck")).toEqual(["n1"]);
    expect(getZoneCards(player,"vault")).toEqual(["v1"]);
  });
  it("masks hidden player zones for inspection",()=> {
    const player:any={deck:["a"],nationDeck:["n1"],discard:["d1"],hand:["h1"],developmentArea:["dev1"]};
    expect(getInspectableZone(player,"deck")).toEqual({ hidden: true, cardIds: [], count: 1 });
    expect(getInspectableZone(player,"nationDeck")).toEqual({ hidden: true, cardIds: [], count: 1 });
    expect(getInspectableZone(player,"discard")).toEqual({ hidden: false, cardIds: ["d1"], count: 1 });
    expect(getInspectableZone(player,"hand")).toEqual({ hidden: false, cardIds: ["h1"], count: 1 });
    expect(getInspectableZone(player,"developmentArea")).toEqual({ hidden: false, cardIds: ["dev1"], count: 1 });
  });
  it("masks hidden bot zones and face-down bot slots",()=> {
    const bot:any={botDeck:["a"],botDynastyDeck:["n1"],botDiscard:["d1"],slots:{1:{slotNumber:1,cardId:"up",face:"up"},2:{slotNumber:2,cardId:"down",face:"down"}}};
    expect(getInspectableZone(bot,"botDeck")).toEqual({ hidden: true, cardIds: [], count: 1 });
    expect(getInspectableZone(bot,"botDynastyDeck")).toEqual({ hidden: true, cardIds: [], count: 1 });
    expect(getInspectableZone(bot,"botDiscard")).toEqual({ hidden: false, cardIds: ["d1"], count: 1 });
    expect(getInspectableZone(bot,"botSlots")).toEqual({ hidden: false, cardIds: ["up"], count: 2 });
  });
  it("returns compact bot pile metadata",()=> {
    const bot:any={botDeck:["a"],botDiscard:["b"],botHistory:[],botPlayArea:["c"],botDynastyDeck:["d"],slots:{1:{slotNumber:1,cardId:"s1",face:"up"},2:{slotNumber:2,face:"down"}}};
    expect(getBotPiles(bot).map((p)=>[p.id,p.count])).toEqual([["botDeck",1],["botDynastyDeck",1],["botDiscard",1],["botHistory",0],["botPlayArea",1],["botSlots",1]]);
  });
});
