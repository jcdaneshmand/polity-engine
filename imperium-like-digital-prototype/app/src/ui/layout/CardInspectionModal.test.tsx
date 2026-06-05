import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardDetailPanel, CardInspectionModal } from "./CardDetailPanel";

const card = {
  displayName: "Harbor Archive",
  suit: "civilised",
  cardType: "action",
  cost: { materials: 2 },
  developmentCost: { progress: 1 },
  vp: { mode: "fixed", value: 3 },
  startingLocation: "market",
  effects: [{ trigger: "on_play", op: "draw", count: 1 }],
  tags: ["test_card"]
};

describe("card inspection", () => {
  it("offers a zoom action when a card can be inspected fullscreen", () => {
    const html = renderToStaticMarkup(<CardDetailPanel card={card} onZoom={() => undefined} />);

    expect(html).toContain("Zoom");
    expect(html).toContain('class="zoom-button"');
  });

  it("shows the main blocked reason near selected card detail", () => {
    const html = renderToStaticMarkup(<CardDetailPanel card={card} blockedReason="No Action tokens available" />);

    expect(html).toContain("detail-blocked-reason");
    expect(html).toContain("No Action tokens available");
  });

  it("renders fullscreen card inspection as an accessible dialog", () => {
    const html = renderToStaticMarkup(<CardInspectionModal card={card} onClose={() => undefined} />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Harbor Archive");
    expect(html).toContain("Close");
    expect(html).toContain("card-inspection-modal");
    expect(html).toContain("detail-grid");
    expect(html).toContain("detail-effects");
  });
});
