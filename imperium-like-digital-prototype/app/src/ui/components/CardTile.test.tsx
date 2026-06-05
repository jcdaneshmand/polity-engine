import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardTile } from "./CardTile";

describe("CardTile", () => {
  it("renders a compact card-like strip and stat row", () => {
    const html = renderToStaticMarkup(
      <CardTile
        card={{
          displayName: "Harbor Archive",
          suit: "civilized",
          cardType: "action",
          cost: { materials: 2 },
          vp: { value: 3 },
          effects: [{ op: "draw" }]
        }}
      />
    );

    expect(html).toContain("card-tile-strip");
    expect(html).toContain("card-stat-row");
    expect(html).toContain("Cost 2");
    expect(html).toContain("VP 3");
  });
});
