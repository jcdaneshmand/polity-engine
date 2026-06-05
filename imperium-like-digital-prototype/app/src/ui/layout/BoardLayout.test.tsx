import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BoardLayout from "./BoardLayout";

const emptyPlayer = {
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
};

function baseGame(overrides: Record<string, unknown> = {}) {
  return {
    round: 1,
    market: ["m1"],
    cardDb: {
      c1: { id: "c1", displayName: "Card1", cost: 0, suit: "civilized", cardType: "action", effects: [] },
      c2: { id: "c2", displayName: "Card2", cost: 0, suit: "civilized", cardType: "action", effects: [] },
      m1: { id: "m1", displayName: "Market1", cost: 0, suit: "civilized", cardType: "action", effects: [] }
    },
    players: {
      "0": { ...emptyPlayer, hand: ["c1"] },
      "1": { ...emptyPlayer }
    },
    log: [],
    ...overrides
  };
}

function renderForViewer(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <BoardLayout
      G={baseGame(overrides)}
      ctx={{ currentPlayer: "1" }}
      playerID="0"
      moves={{}}
    />
  );
}

describe("BoardLayout", () => {
  it("uses the online player seat for pending cleanup market targets", () => {
    const html = renderForViewer({
          pendingCleanupMarketResourceChoice: {
            playerId: "0",
            resource: "knowledge",
            amount: 1,
            cardIds: ["m1"]
          }
    });

    expect(html).toContain("Place cleanup resource on Market1");
    expect(html).toContain("is-valid-target");
    expect(html).not.toContain("waiting for player 0");
  });

  it.each([
    {
      name: "pending market gain",
      pending: { pendingMarketCardChoice: { playerId: "0", sourceCardId: "picker", op: "gain_card", cardIds: ["m1"], destination: "hand" } },
      text: "Gain Market1"
    },
    {
      name: "pending market acquire",
      pending: { pendingAcquireChoice: { playerId: "0", sourceCardId: "picker", source: "market", cardIds: ["m1"], destination: "hand" } },
      text: "Acquire Market1"
    },
    {
      name: "pending market exile",
      pending: { pendingExileChoice: { playerId: "0", sourceCardId: "picker", source: "market", cardIds: ["m1"] } },
      text: "Exile Market1"
    },
    {
      name: "pending market break through",
      pending: { pendingBreakThroughChoice: { playerId: "0", sourceCardId: "breaker", source: "market", suit: "civilized", cardIds: ["m1"] } },
      text: "Break Through Market1"
    },
    {
      name: "pending one-card market resource placement",
      pending: { pendingMarketResourcePlacementChoice: { playerId: "0", sourceCardId: "mover", resource: "materials", amount: 1, cardIds: ["m1"] } },
      text: "Move materials to Market1"
    }
  ])("uses the online player seat for $name targets", ({ pending, text }) => {
    const html = renderForViewer(pending);

    expect(html).toContain(text);
    expect(html).toContain("is-valid-target");
    expect(html).not.toContain("waiting for player 0");
  });

  it("uses the online player seat for pending cleanup discard targets", () => {
    const html = renderForViewer({
      pendingCleanupDiscardChoice: {
        playerId: "0",
        cardIds: ["c1"]
      }
    });

    expect(html).toContain("Discard selected cards");
    expect(html).toContain("Keep Hand");
    expect(html).toContain("Select to discard");
    expect(html).not.toContain("waiting for player 0");
  });

  it("uses the online player seat for looked-card pending choices", () => {
    const html = renderForViewer({
      lookedCards: { playerId: "0", source: "deck", cardIds: ["c1", "c2"] },
      pendingLookTakeChoice: {
        playerId: "0",
        source: "deck",
        destination: "hand",
        cardIds: ["c1", "c2"]
      }
    });

    expect(html).toContain("Take Card1; return Card2");
    expect(html).toContain("Take Card2; return Card1");
    expect(html).not.toContain("waiting for player 0");
  });
});
