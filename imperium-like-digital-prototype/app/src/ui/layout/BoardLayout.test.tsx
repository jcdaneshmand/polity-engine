import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BoardLayout, { dispatchBoardAction } from "./BoardLayout";

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
      e1: { id: "e1", displayName: "Engine", cost: 0, suit: "civilized", cardType: "in_play", type: "in_play", effects: [] },
      f1: { id: "f1", displayName: "Fame", cost: 0, suit: "fame", cardType: "fame", type: "fame", effects: [] },
      route1: { id: "route1", displayName: "River Road", cost: 0, suit: "trade_route", cardType: "trade_route", type: "trade_route", effects: [] },
      u1: { id: "u1", displayName: "Unrest", cost: 0, suit: "unrest", cardType: "unrest", type: "unrest", effects: [] },
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
      viewerPlayerID="0"
      moves={{}}
    />
  );
}

function renderForWrongViewer(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <BoardLayout
      G={baseGame(overrides)}
      ctx={{ currentPlayer: "1" }}
      playerID="1"
      viewerPlayerID="1"
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

  it("maps online boardgame seats to legacy one-based game player ids", () => {
    const html = renderToStaticMarkup(
      <BoardLayout
        G={baseGame({
          playOrder: ["1"],
          players: {
            "1": { ...emptyPlayer }
          },
          pendingCleanupMarketResourceChoice: {
            playerId: "1",
            resource: "knowledge",
            amount: 1,
            cardIds: ["m1"]
          }
        })}
        ctx={{ currentPlayer: "1" }}
        playerID="0"
        viewerPlayerID="0"
        moves={{}}
      />
    );

    expect(html).toContain("Place cleanup resource on Market1");
    expect(html).toContain("is-valid-target");
    expect(html).not.toContain("waiting for player 1");
  });

  it("uses the active player for local cleanup market targets when boardgame.io supplies a stale playerID", () => {
    const html = renderToStaticMarkup(
      <BoardLayout
        G={baseGame({
          pendingCleanupMarketResourceChoice: {
            playerId: "1",
            resource: "knowledge",
            amount: 1,
            cardIds: ["m1"]
          }
        })}
        ctx={{ currentPlayer: "1" }}
        playerID="0"
        moves={{}}
      />
    );

    expect(html).toContain("Place cleanup resource on Market1");
    expect(html).toContain("is-valid-target");
    expect(html).not.toContain("waiting for player 1");
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

  it.each([
    {
      name: "generic choose-one",
      pending: { pendingChoice: { playerId: "0", sourceCardId: "c1", choices: [[{ op: "gain_resource", resource: "knowledge", amount: 1 }], []] } },
      text: "Choose 1: Gain 1 knowledge"
    },
    {
      name: "draw",
      pending: { pendingDrawChoice: { playerId: "0", sourceCardId: "draw_source", source: "deck", cardIds: ["c1"] } },
      text: "Draw Card1"
    },
    {
      name: "find",
      pending: { pendingFindChoice: { playerId: "0", sourceCardId: "find_source", source: "deck", cardIds: ["c1"] } },
      text: "Find Card1"
    },
    {
      name: "discard",
      pending: { pendingDiscardChoice: { playerId: "0", sourceCardId: "discard_source", cardIds: ["c1", "c2"], count: 1 } },
      text: "Discard Card1"
    },
    {
      name: "return unrest",
      pending: { pendingReturnUnrestChoice: { playerId: "0", sourceCardId: "return_source", cardIds: ["u1"], sourceZones: ["hand"] } },
      text: "Return Unrest"
    },
    {
      name: "return fame",
      pending: { pendingReturnFameChoice: { playerId: "0", sourceCardId: "return_fame_source", cardIds: ["f1"], sourceZones: ["discard"] } },
      text: "Return Fame"
    },
    {
      name: "place on deck",
      pending: { pendingPlaceOnDeckChoice: { playerId: "0", sourceCardId: "place_source", sourceZone: "discard", cardIds: ["c1"] } },
      text: "Place Card1 on deck"
    },
    {
      name: "return exhaust token",
      pending: { pendingReturnExhaustTokenChoice: { playerId: "0", sourceCardId: "return_exhaust_source", cardIds: ["e1"] } },
      text: "Return Exhaust token from Engine"
    },
    {
      name: "free play",
      pending: { pendingFreePlayChoice: { playerId: "0", sourceCardId: "free_play_source", cardIds: ["c1"] } },
      text: "Free Play Card1"
    },
    {
      name: "give card",
      pending: { pendingGiveCardChoice: { playerId: "0", sourceCardId: "give_source", cardIds: ["c1"], recipientPlayerIds: ["1"] } },
      text: "Give Card1 to player 1"
    },
    {
      name: "swap",
      pending: { pendingSwapChoice: { playerId: "0", sourceCardId: "swap_source", sourceZone: "hand", choices: [{ cardId: "c1", marketCardId: "m1" }] } },
      text: "Swap Card1 with Market1"
    },
    {
      name: "reactive exhaust",
      pending: { pendingReactiveExhaustChoice: { playerId: "0", resolvingPlayerId: "0", sourceCardId: "reactive_source", cardIds: ["e1"], trigger: "after_gain_resource" } },
      text: "Exhaust Engine"
    },
    {
      name: "unrest allocation",
      pending: { pendingUnrestAllocationChoice: { playerId: "0", recipientPlayerIds: ["1", "0"], countPerPlayer: 1, availableUnrestCardIds: ["u1"] } },
      text: "Give Unrest to 1"
    },
    {
      name: "solstice order",
      pending: { pendingSolsticeOrderChoice: { playerId: "0", phase: "on_solstice", cardIds: ["c1", "c2"] } },
      text: "Resolve Card1 then Card2"
    },
    {
      name: "look order",
      pending: { pendingLookOrderChoice: { playerId: "0", source: "deck", cardIds: ["c1", "c2"] } },
      text: "Return Card1 then Card2"
    }
  ])("uses the online player seat for pending $name choices", ({ pending, text }) => {
    const html = renderForViewer(pending);

    expect(html).toContain(text);
    expect(html).not.toContain("waiting for player 0");
  });

  it.each([
    {
      name: "market cleanup resource",
      pending: { pendingCleanupMarketResourceChoice: { playerId: "0", resource: "knowledge", amount: 1, cardIds: ["m1"] } },
      targetText: "Place cleanup resource on Market1"
    },
    {
      name: "market gain",
      pending: { pendingMarketCardChoice: { playerId: "0", sourceCardId: "picker", op: "gain_card", cardIds: ["m1"], destination: "hand" } },
      targetText: "Gain Market1"
    },
    {
      name: "draw",
      pending: { pendingDrawChoice: { playerId: "0", sourceCardId: "draw_source", source: "deck", cardIds: ["c1"] } },
      targetText: "Draw Card1"
    },
    {
      name: "cleanup discard",
      pending: { pendingCleanupDiscardChoice: { playerId: "0", cardIds: ["c1"] } },
      targetText: "Keep Hand"
    },
    {
      name: "look take",
      pending: {
        lookedCards: { playerId: "0", source: "deck", cardIds: ["c1", "c2"] },
        pendingLookTakeChoice: { playerId: "0", source: "deck", destination: "hand", cardIds: ["c1", "c2"] }
      },
      targetText: "Take Card1; return Card2"
    }
  ])("keeps pending $name choices blocked for the wrong online player seat", ({ pending, targetText }) => {
    const html = renderForWrongViewer(pending);

    expect(html).toContain("waiting for player 0");
    expect(html).not.toContain("is-valid-target");
    expect(html).toContain(targetText);
    expect(html).toContain("disabled");
  });

  it("shows viewer-owned board state while preserving the active turn label", () => {
    const html = renderToStaticMarkup(
      <BoardLayout
        G={baseGame({
          players: {
            "0": { ...emptyPlayer, hand: ["c1"], resources: { materials: 3, influence: 0, knowledge: 0, goods: 0, unrest: 0 } },
            "1": { ...emptyPlayer, hand: ["c2"], resources: { materials: 0, influence: 0, knowledge: 5, goods: 0, unrest: 0 } }
          }
        })}
        ctx={{ currentPlayer: "1" }}
        playerID="0"
        viewerPlayerID="0"
        moves={{}}
      />
    );

    expect(html).toContain("Player 1");
    expect(html).toContain("Card1");
    expect(html).not.toContain("Card2");
    expect(html).toContain("Materials");
    expect(html).toContain("3");
  });

  it.each([
    {
      action: { action: "resolveCleanupMarketResource", cardId: "m1", enabled: true },
      moveName: "resolveCleanupMarketResource",
      args: ["m1"]
    },
    {
      action: { action: "resolveMarketResourcePlacement", cardIds: ["m1"], enabled: true },
      moveName: "resolveMarketResourcePlacement",
      args: [["m1"]]
    },
    {
      action: { action: "resolveAcquireChoice", cardId: "m1", enabled: true },
      moveName: "resolveAcquireChoice",
      args: ["m1"]
    },
    {
      action: { action: "resolveMarketCardChoice", cardId: "m1", enabled: true },
      moveName: "resolveMarketCardChoice",
      args: ["m1"]
    },
    {
      action: { action: "resolveBreakThroughChoice", cardId: "m1", enabled: true },
      moveName: "resolveBreakThroughChoice",
      args: ["m1"]
    },
    {
      action: { action: "resolveExileChoice", cardId: "m1", enabled: true },
      moveName: "resolveExileChoice",
      args: ["m1"]
    }
  ])("dispatches direct market click action $action.action to the published move", ({ action, moveName, args }) => {
    const calls: Array<{ moveName: string; args: unknown[] }> = [];
    const moves = new Proxy({}, {
      get: (_target, prop: string) => (...receivedArgs: unknown[]) => calls.push({ moveName: prop, args: receivedArgs })
    });

    dispatchBoardAction({
      action,
      moves,
      setDetailCardId: () => undefined,
      setSelection: () => undefined
    });

    expect(calls).toEqual([{ moveName, args }]);
  });
});
