import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BoardLayout from "./BoardLayout";

describe("BoardLayout", () => {
  it("uses the online player seat for pending cleanup market targets", () => {
    const html = renderToStaticMarkup(
      <BoardLayout
        G={{
          round: 1,
          market: ["m1"],
          cardDb: {
            m1: { id: "m1", displayName: "Market1", cost: 0, suit: "civilized", cardType: "action", effects: [] }
          },
          players: {
            "0": {
              hand: [],
              deck: [],
              discard: [],
              playArea: [],
              history: [],
              exile: [],
              powerArea: [],
              stateArea: [],
              developmentArea: [],
              nationDeck: [],
              resources: { materials: 0, influence: 0, knowledge: 0, goods: 0, unrest: 0 }
            },
            "1": {
              hand: [],
              deck: [],
              discard: [],
              playArea: [],
              history: [],
              exile: [],
              powerArea: [],
              stateArea: [],
              developmentArea: [],
              nationDeck: [],
              resources: { materials: 0, influence: 0, knowledge: 0, goods: 0, unrest: 0 }
            }
          },
          pendingCleanupMarketResourceChoice: {
            playerId: "0",
            resource: "knowledge",
            amount: 1,
            cardIds: ["m1"]
          },
          log: []
        }}
        ctx={{ currentPlayer: "1" }}
        playerID="0"
        moves={{}}
      />
    );

    expect(html).toContain("Place cleanup resource on Market1");
    expect(html).toContain("is-valid-target");
    expect(html).not.toContain("waiting for player 0");
  });
});
