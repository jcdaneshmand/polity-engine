import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";
import { runEffects } from "../cards/effectRunner";

describe("trade routes module", () => {
  it("enabled adds exhaust token", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    expect(G.players["0"].exhaustTokensBase).toBeGreaterThan(1);
  });
  it("trade op logs ignore when disabled", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:[], enabledVariants:[] } });
    runEffects({ G, playerId:"0", enabledExpansions:[] as any }, [{ trigger:"on_play", op:"trade" } as any]);
    expect(G.log.at(-1)?.message).toContain("Ignored trade");
  });
});
