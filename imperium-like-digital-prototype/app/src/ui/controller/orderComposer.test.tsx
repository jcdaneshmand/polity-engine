import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderChoicePanel } from "../layout/OrderChoicePanel";
import { getOrderChoiceModel, isExactOrder, moveOrderItem, orderComposerOperationCount, reconcileOrder } from "./orderComposer";

function pending(count: number, kind: "solstice" | "look" | "look_take" = "solstice") {
  const cardIds = Array.from({ length: count }, (_, index) => `c${index + 1}`);
  const cardDb = Object.fromEntries(cardIds.map((id) => [id, { id, displayName: `Card ${id.slice(1)}` }]));
  if (kind === "look") return { cardDb, pendingLookOrderChoice: { playerId: "1", source: "deck", cardIds } };
  if (kind === "look_take") return { cardDb, pendingLookTakeChoice: { playerId: "1", source: "deck", destination: "hand", cardIds } };
  return { cardDb, pendingSolsticeOrderChoice: { playerId: "1", phase: "on_solstice", cardIds } };
}

describe("incremental order composer", () => {
  it("keeps 8-card and 12-card controls linear", () => {
    expect(orderComposerOperationCount(getOrderChoiceModel(pending(8))!)).toBe(18);
    expect(orderComposerOperationCount(getOrderChoiceModel(pending(12))!)).toBe(26);
    expect(orderComposerOperationCount(getOrderChoiceModel(pending(12, "look_take"))!)).toBe(38);
  });

  it("can compose any order through adjacent moves without truncation", () => {
    const original = getOrderChoiceModel(pending(12))!.cardIds;
    const desired = [...original].reverse();
    let order = [...original];
    desired.forEach((cardId, targetIndex) => {
      let index = order.indexOf(cardId);
      while (index > targetIndex) {
        order = moveOrderItem(order, index, -1);
        index -= 1;
      }
    });
    expect(order).toEqual(desired);
    expect(isExactOrder(order, original)).toBe(true);
  });

  it("preserves valid choices and clears stale ids when pending state changes", () => {
    expect(reconcileOrder(["c3", "stale", "c1"], ["c1", "c2", "c3", "c4"])).toEqual(["c3", "c1", "c2", "c4"]);
    expect(isExactOrder(["c1", "c1"], ["c1", "c2"])).toBe(false);
  });

  it("renders named controls only for the player who owns the hidden choice", () => {
    const G = pending(3, "look_take");
    const ownerHtml = renderToStaticMarkup(<OrderChoicePanel G={G} viewerId="1" onAction={() => undefined} />);
    const opponentHtml = renderToStaticMarkup(<OrderChoicePanel G={G} viewerId="2" onAction={() => undefined} />);
    expect(ownerHtml).toContain("Take Card 1");
    expect(ownerHtml).toContain("Move Card 2 up");
    expect(ownerHtml).toContain("Take card and return the rest");
    expect(opponentHtml).toContain("Waiting for player 1");
    expect(opponentHtml).not.toContain("Card 1");
  });
});
