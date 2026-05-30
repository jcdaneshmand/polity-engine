import { describe, expect, it } from "vitest";
import { importPrivateDataFiles } from "../../../app/src/ui/setup/privateDataImport";

describe("private data browser import", () => {
  it("imports normalized JSON files by role", async () => {
    const result = await importPrivateDataFiles([
      { name: "cards.normalized.json", text: JSON.stringify([{ id: "json_card", displayName: "JSON Card" }]) },
      { name: "nations.normalized.json", text: JSON.stringify([{ id: "json_nation", displayName: "JSON Nation" }]) }
    ]);

    expect(result.privateData.cards?.[0]?.id).toBe("json_card");
    expect(result.privateData.nations?.[0]?.id).toBe("json_nation");
    expect(result.files.map((file) => file.status)).toEqual(["loaded", "loaded"]);
  });

  it("imports raw private card CSV into normalized records", async () => {
    const csv = [
      "card_id,public_placeholder_name,card_name_private,source_box,set_or_nation,suit,suit_icons,card_type,state_requirement,cost_materials,cost_population,cost_progress,cost_goods,development_cost_materials,development_cost_population,development_cost_progress,development_cost_goods,vp_mode,vp_value,starting_location,player_count_requirement,is_trade_route_expansion,raw_effect_text_private,effect_ops_json,tags,notes,implemented,tested,required_expansions,excluded_expansions,allowed_modes,disallowed_modes,ownership,commons_set_id,setup_banner_suit,commons_group,replacement_for_card_id,replacement_group_id,conflicts_with_nation_ids,delayable_in_lowered_aggression,market_eligible,small_deck_eligible,main_deck_eligible,unrest_pile_eligible,fame_deck_eligible",
      "csv_card,CSV Card,,,,none,,action,,0,0,0,0,0,0,0,0,none,,market,false,false,,\"[]\",,,true,true,,,,,commons,custom,,,,,,,,,,,"
    ].join("\n");

    const result = await importPrivateDataFiles([{ name: "imperium_cards_private.csv", text: csv }]);

    expect(result.privateData.cards?.[0]).toMatchObject({
      id: "csv_card",
      displayName: "CSV Card",
      ownership: "commons",
      commonsSetId: "custom"
    });
    expect(result.files[0]).toMatchObject({ role: "cards", format: "csv", status: "loaded" });
  });
});
