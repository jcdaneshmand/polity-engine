import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HandRow } from "./HandRow";

describe("HandRow", () => {
  it("marks only the selected cleanup discard copy when card ids repeat", () => {
    const html = renderToStaticMarkup(
      <HandRow
        hand={["c1", "c1"]}
        cardDb={{
          c1: { id: "c1", displayName: "Repeated Card", suit: "civilized", cardType: "action", effects: [] }
        }}
        cleanupSelectedSlots={[1]}
        onSelect={() => {}}
      />
    );

    expect(html.match(/is-cleanup-selected/g)?.length ?? 0).toBe(1);
  });
});
