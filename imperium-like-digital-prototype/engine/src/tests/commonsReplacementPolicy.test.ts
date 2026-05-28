import { describe, expect, it } from "vitest";
import { resolveNationConflictReplacement } from "../setup/commonsReplacementPolicy";

const options:any={commonsSetId:"classics",playerCount:2,effectiveCommonsPlayerCount:2,enabledExpansions:[],enabledVariants:[],selectedNationIds:["n1"],replacementPolicy:"use_replacements"};

describe("commons replacement",()=>{
  it("can substitute eligible replacement card",()=>{
    const rep=resolveNationConflictReplacement({card:{id:"c1",replacementGroupId:"g1"} as any, allCards:[{id:"r1",ownership:"replacement",replacementGroupId:"g1"}] as any, options});
    expect(rep?.id).toBe("r1");
  });
});
