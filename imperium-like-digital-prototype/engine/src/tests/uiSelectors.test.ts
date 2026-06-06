import { describe, expect, it } from "vitest";
import { getBotPiles, getCurrentPlayer, getInspectableLookedCards, getInspectableSharedPile, getInspectableZone, getMarketCards, getOwnerVisibleZoneIds, getPlayerZoneCounts, getPlayerZoneLabels, getRecentLogEntries, getSharedPiles, getZoneCards } from "../../../app/src/ui/layout/uiSelectors";

describe("ui selectors",()=>{
  it("handles missing market",()=> expect(getMarketCards({market:null} as any)).toEqual([]));
  it("handles missing log",()=> expect(getRecentLogEntries({log:null} as any, 5)).toEqual([]));
  it("returns current player safely",()=> { const G:any={players:{"1":{id:0}}}; expect(getCurrentPlayer(G,{currentPlayer:"1"})).toEqual({id:0}); });
  it("returns empty arrays instead of throwing",()=> expect(()=>getMarketCards({} as any)).not.toThrow());
  it("reports shared pile counts from live deck and public pile state",()=> {
    const G:any={
      marketDecks:{regionDeck:["r1","r2"],uncivilizedDeck:["u1"],civilizedDeck:["c1","c2","c3"],mainDeck:["m1"],tributaryDeck:["t1"]},
      fameDeck:{available:["f1"],specialBottomCardId:"king",specialBottomSide:"B",resolvedSpecialByPlayer:{}},
      unrestPile:["unrest1","unrest2"],
      players:{"1":{exile:["e1"]},"2":{exile:["e2","e3"]}},
      globalSpecialZones:{exile:{id:"exile",displayName:"Exile",cardIds:["setup_e1","setup_e2"],visibility:"public",scoresAsOwned:false}}
    };

    expect(Object.fromEntries(getSharedPiles(G).map((pile)=>[pile.id,pile.count]))).toMatchObject({
      region:2,
      uncivilized:1,
      civilized:3,
      main:1,
      fame:2,
      unrest:2,
      exile:5
    });
  });
  it("exposes public Exile card identities without exposing hidden deck identities",()=> {
    const G:any={
      marketDecks:{mainDeck:["hidden_main"],regionDeck:["hidden_region"]},
      players:{"1":{exile:["personal_e1"]},"2":{exile:["personal_e2"]}},
      globalSpecialZones:{
        exile:{id:"exile",displayName:"Exile",cardIds:["setup_e1","setup_e2"],visibility:"public",scoresAsOwned:false},
        hidden_archive:{id:"hidden_archive",displayName:"Hidden",cardIds:["secret"],visibility:"owner",scoresAsOwned:false}
      }
    };

    expect(getInspectableSharedPile(G,"exile")).toEqual({ hidden:false, cardIds:["setup_e1","setup_e2","personal_e1","personal_e2"], count:4 });
    expect(getInspectableSharedPile(G,"main")).toEqual({ hidden:true, cardIds:[], count:1 });
    expect(getInspectableSharedPile(G,"region")).toEqual({ hidden:true, cardIds:[], count:1 });
    expect(getInspectableSharedPile(G,"hidden_archive")).toEqual({ hidden:true, cardIds:[], count:1 });
  });
  it("exposes only the public bottom card for small market decks that still contain it",()=> {
    const G:any={
      marketDecks:{regionDeck:["hidden_region_top","public_region_bottom"],uncivilizedDeck:["public_uncivilized_bottom"],mainDeck:["hidden_main"]},
      marketDeckBottomCards:{regionDeck:"public_region_bottom",uncivilizedDeck:"public_uncivilized_bottom"}
    };

    expect(getInspectableSharedPile(G,"region")).toEqual({ hidden:false, cardIds:["public_region_bottom"], count:2 });
    expect(getInspectableSharedPile(G,"uncivilized")).toEqual({ hidden:false, cardIds:["public_uncivilized_bottom"], count:1 });
    expect(getInspectableSharedPile(G,"main")).toEqual({ hidden:true, cardIds:[], count:1 });

    G.marketDecks.regionDeck = ["public_region_bottom", "new_hidden_bottom"];
    expect(getInspectableSharedPile(G,"region")).toEqual({ hidden:true, cardIds:[], count:2 });
  });
  it("keeps ordinary Fame cards hidden but exposes the face-up special bottom Fame card once it is alone",()=> {
    const G:any={
      fameDeck:{available:["hidden_fame"],specialBottomCardId:"king_of_kings",specialBottomSide:"A",resolvedSpecialByPlayer:{}}
    };

    expect(getInspectableSharedPile(G,"fame")).toEqual({ hidden:true, cardIds:[], count:2 });

    G.fameDeck.available = [];
    expect(getInspectableSharedPile(G,"fame")).toEqual({ hidden:false, cardIds:["king_of_kings"], count:1 });

    G.fameDeck.specialBottomSide = "face_down";
    expect(getInspectableSharedPile(G,"fame")).toEqual({ hidden:true, cardIds:[], count:1 });
  });
  it("returns cards for a selected player zone",()=> {
    const player:any={deck:["a"],nationDeck:["n1"],sideAreas:{vault:["v1"]}};
    expect(getZoneCards(player,"deck")).toEqual(["a"]);
    expect(getZoneCards(player,"nationDeck")).toEqual(["n1"]);
    expect(getZoneCards(player,"vault")).toEqual(["v1"]);
  });
  it("includes side areas in player zone chrome metadata",()=> {
    const G:any={
      activeNationRulesets:{
        "1":{
          zoneOverrides:[{ op:"replace_history_with_zone", zoneId:"sunken", displayName:"Sunken", cardsScore:true }]
        }
      }
    };
    const player:any={deck:[],discard:[],hand:[],playArea:[],history:[],developmentArea:[],nationDeck:[],sideAreas:{sunken:["s1","s2"]}};

    expect(getPlayerZoneCounts(player)).toMatchObject({ sunken:2 });
    expect(getPlayerZoneLabels(G,"1")).toEqual({ sunken:"Sunken" });
  });
  it("labels setup-created side areas from ruleset metadata",()=> {
    const G:any={
      activeNationRulesets:{
        "1":{
          setupOverrides:[{ op:"create_side_area", areaId:"ceremony_track", displayName:"Ceremony Track", public:true }],
          zoneOverrides:[]
        }
      }
    };
    const player:any={deck:[],discard:[],hand:[],playArea:[],history:[],developmentArea:[],nationDeck:[],sideAreas:{ceremony_track:["marker"]}};

    expect(getPlayerZoneCounts(player)).toMatchObject({ ceremony_track:1 });
    expect(getPlayerZoneLabels(G,"1")).toEqual({ ceremony_track:"Ceremony Track" });
  });
  it("masks hidden player zones for inspection",()=> {
    const player:any={deck:["a"],nationDeck:["n1"],discard:["d1"],hand:["h1"],developmentArea:["dev1"]};
    expect(getInspectableZone(player,"deck")).toEqual({ hidden: true, cardIds: [], count: 1 });
    expect(getInspectableZone(player,"nationDeck")).toEqual({ hidden: true, cardIds: [], count: 1 });
    expect(getInspectableZone(player,"discard")).toEqual({ hidden: false, cardIds: ["d1"], count: 1 });
    expect(getInspectableZone(player,"hand")).toEqual({ hidden: false, cardIds: ["h1"], count: 1 });
    expect(getInspectableZone(player,"developmentArea")).toEqual({ hidden: false, cardIds: ["dev1"], count: 1 });
  });
  it("shows History card identities only to their owner",()=> {
    const player:any={history:["hist1","hist2"]};
    expect(getInspectableZone(player,"history",{ ownerPlayerId:"1", viewerPlayerId:"1" })).toEqual({ hidden: false, cardIds: ["hist1","hist2"], count: 2 });
    expect(getInspectableZone(player,"history",{ ownerPlayerId:"1", viewerPlayerId:"2" })).toEqual({ hidden: true, cardIds: [], count: 2 });
  });
  it("treats History replacement zones as owner-visible zones",()=> {
    const G:any={
      activeNationRulesets:{
        "1":{
          zoneOverrides:[{ op:"replace_history_with_zone", zoneId:"sunken", displayName:"Sunken", cardsScore:true }]
        }
      }
    };
    const player:any={sideAreas:{sunken:["hist1","hist2"]}};
    const ownerVisibleZoneIds = getOwnerVisibleZoneIds(G,"1");

    expect(getInspectableZone(player,"sunken",{ ownerPlayerId:"1", viewerPlayerId:"1", ownerVisibleZoneIds })).toEqual({ hidden:false, cardIds:["hist1","hist2"], count:2 });
    expect(getInspectableZone(player,"sunken",{ ownerPlayerId:"1", viewerPlayerId:"2", ownerVisibleZoneIds })).toEqual({ hidden:true, cardIds:[], count:2 });
  });
  it("treats non-public setup-created side areas as owner-visible zones",()=> {
    const G:any={
      activeNationRulesets:{
        "1":{
          setupOverrides:[{ op:"create_side_area", areaId:"ceremony_track", displayName:"Ceremony Track", public:false }],
          zoneOverrides:[]
        }
      }
    };
    const player:any={sideAreas:{ceremony_track:["secret_marker"]}};
    const ownerVisibleZoneIds = getOwnerVisibleZoneIds(G,"1");

    expect(getInspectableZone(player,"ceremony_track",{ ownerPlayerId:"1", viewerPlayerId:"1", ownerVisibleZoneIds })).toEqual({ hidden:false, cardIds:["secret_marker"], count:1 });
    expect(getInspectableZone(player,"ceremony_track",{ ownerPlayerId:"1", viewerPlayerId:"2", ownerVisibleZoneIds })).toEqual({ hidden:true, cardIds:[], count:1 });
  });
  it("exposes a separately tracked Accession as the public bottom Nation deck card",()=> {
    const player:any={deck:[],nationDeck:["n1","n2"],accessionCardId:"acc"};
    expect(getInspectableZone(player,"nationDeck")).toEqual({ hidden: false, cardIds: ["acc"], count: 3 });
    expect(getPlayerZoneCounts(player).nationDeck).toBe(3);
  });
  it("exposes an embedded Accession only when it is still the public bottom Nation deck card",()=> {
    const player:any={deck:[],nationDeck:["n1","n2","acc"],accessionCardId:"acc"};
    expect(getInspectableZone(player,"nationDeck")).toEqual({ hidden: false, cardIds: ["acc"], count: 3 });

    player.nationDeck = ["n1","acc","n2"];
    expect(getInspectableZone(player,"nationDeck")).toEqual({ hidden: true, cardIds: [], count: 3 });
  });
  it("shows hand to its owner and count-only to opponents",()=> {
    const player:any={hand:["h1","h2"]};
    expect(getInspectableZone(player,"hand",{ ownerPlayerId:"1", viewerPlayerId:"1" })).toEqual({ hidden: false, cardIds: ["h1","h2"], count: 2 });
    expect(getInspectableZone(player,"hand",{ ownerPlayerId:"1", viewerPlayerId:"2" })).toEqual({ hidden: true, cardIds: [], count: 2 });
  });
  it("masks hidden bot zones and face-down bot slots",()=> {
    const bot:any={botDeck:["a"],botDynastyDeck:["n1"],botDiscard:["d1"],slots:{1:{slotNumber:1,cardId:"up",face:"up"},2:{slotNumber:2,cardId:"down",face:"down"}}};
    expect(getInspectableZone(bot,"botDeck")).toEqual({ hidden: true, cardIds: [], count: 1 });
    expect(getInspectableZone(bot,"botDynastyDeck")).toEqual({ hidden: true, cardIds: [], count: 1 });
    expect(getInspectableZone(bot,"botDiscard")).toEqual({ hidden: false, cardIds: ["d1"], count: 1 });
    expect(getInspectableZone(bot,"botSlots")).toEqual({ hidden: false, cardIds: ["up"], count: 2 });
  });
  it("shows looked cards only to the player who looked",()=> {
    const G:any={lookedCards:{playerId:"1",source:"deck",cardIds:["a","b"]}};
    expect(getInspectableLookedCards(G,"1")).toEqual({ hidden:false, source:"deck", cardIds:["a","b"], count:2 });
    expect(getInspectableLookedCards(G,"2")).toEqual({ hidden:true, source:"deck", cardIds:[], count:2 });
    expect(getInspectableLookedCards({} as any,"1")).toBeUndefined();
  });
  it("returns compact bot pile metadata",()=> {
    const bot:any={botDeck:["a"],botDiscard:["b"],botHistory:[],botPlayArea:["c"],botDynastyDeck:["d"],slots:{1:{slotNumber:1,cardId:"s1",face:"up"},2:{slotNumber:2,face:"down"}}};
    expect(getBotPiles(bot).map((p)=>[p.id,p.count])).toEqual([["botDeck",1],["botDynastyDeck",1],["botDiscard",1],["botHistory",0],["botPlayArea",1],["botSlots",1]]);
  });
});
