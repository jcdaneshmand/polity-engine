import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardDetailPanel, CardInspectionModal, isCardInspectionCloseKey } from "./CardDetailPanel";

const card = {
  id: "harbor_archive",
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
  it("recognizes Escape as the modal close key", () => {
    expect(isCardInspectionCloseKey("Escape")).toBe(true);
    expect(isCardInspectionCloseKey("Enter")).toBe(false);
    expect(isCardInspectionCloseKey("z")).toBe(false);
  });

  it("renders empty detail state with stable QA metadata", () => {
    const html = renderToStaticMarkup(<CardDetailPanel card={null} />);

    expect(html).toContain('data-qa="card-detail-panel"');
    expect(html).toContain('data-detail-state="empty"');
    expect(html).toContain("Select a card.");
  });

  it("offers a zoom action when a card can be inspected fullscreen", () => {
    const html = renderToStaticMarkup(<CardDetailPanel card={card} onZoom={() => undefined} />);

    expect(html).toContain('data-qa="card-detail-panel"');
    expect(html).toContain('data-detail-state="preview"');
    expect(html).toContain('data-card-id="harbor_archive"');
    expect(html).toContain("Zoom");
    expect(html).toContain('class="zoom-button"');
  });

  it("marks selected and pinned detail states separately", () => {
    const selectedHtml = renderToStaticMarkup(<CardDetailPanel card={card} selected />);
    const pinnedHtml = renderToStaticMarkup(<CardDetailPanel card={card} pinned onUnpin={() => undefined} />);

    expect(selectedHtml).toContain('data-detail-state="selected"');
    expect(selectedHtml).toContain('data-selected="true"');
    expect(selectedHtml).toContain("Selected");
    expect(pinnedHtml).toContain('data-detail-state="pinned"');
    expect(pinnedHtml).toContain('data-pinned="true"');
    expect(pinnedHtml).toContain("Pinned");
    expect(pinnedHtml).toContain("Unpin");
  });

  it("shows the main blocked reason near selected card detail with machine-readable state", () => {
    const html = renderToStaticMarkup(
      <CardDetailPanel
        card={card}
        selected
        blockedReason="No Action tokens available"
        ruleProvenance="Action rules"
      />
    );

    expect(html).toContain("detail-blocked-reason");
    expect(html).toContain("No Action tokens available");
    expect(html).toContain('data-detail-state="selected"');
    expect(html).toContain('data-has-blocked-reason="true"');
    expect(html).toContain('data-rule-provenance="Action rules"');
  });

  it("renders fullscreen card inspection as an accessible dialog", () => {
    const html = renderToStaticMarkup(<CardInspectionModal card={card} onClose={() => undefined} />);

    expect(html).toContain('data-qa="card-inspection-modal"');
    expect(html).toContain('data-card-id="harbor_archive"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="card-inspection-title"');
    expect(html).toContain('aria-label="Close card inspection"');
    expect(html).toContain('data-detail-state="zoomed"');
    expect(html).toContain("Harbor Archive");
    expect(html).toContain("Close");
    expect(html).toContain("card-inspection-modal");
    expect(html).toContain("detail-grid");
    expect(html).toContain("detail-effects");
  });
});
