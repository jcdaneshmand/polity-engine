import { describe, expect, it } from "vitest";
import { getCurrentPlayer, getMarketCards, getRecentLogEntries } from "../../../app/src/ui/layout/uiSelectors";

describe("ui selectors",()=>{
  it("handles missing market",()=> expect(getMarketCards({market:null} as any)).toEqual([]));
  it("handles missing log",()=> expect(getRecentLogEntries({log:null} as any, 5)).toEqual([]));
  it("returns current player safely",()=> { const G:any={players:{"0":{id:0}}}; expect(getCurrentPlayer(G,{currentPlayer:"0"})).toEqual({id:0}); });
  it("returns empty arrays instead of throwing",()=> expect(()=>getMarketCards({} as any)).not.toThrow());
});
