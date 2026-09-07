import type { GameState } from "../../engine/src/game/state";
import { CURRENT_RULES_VERSION } from "../../engine/src/game/version";
import type { ExpansionId, GameMode } from "../../engine/src/options/gameOptions";
import { inspectLocalGameExport, serializeLocalGame, type SavedLocalGameEnvelope } from "./localGameSave";
import { PUBLIC_FICTIONAL_FIXTURE_VERSION } from "./publicFictionalFixtureMetadata";

export const GUIDED_GAME_STORAGE_KEY = "polity-engine.guidedGame.v1";
export const GUIDED_GAME_LESSON_VERSION = 1;

export type GuidedChapterId = "commit-action" | "progression" | "reaction" | "trade" | "ordering" | "scoring";

export type GuidedStep = {
  id: string;
  title: string;
  instruction: string;
  rule: string;
  targetCardIds?: string[];
};

export type GuidedChapter = {
  id: GuidedChapterId;
  number: number;
  title: string;
  resetNotice?: string;
  scenarioId: "F01" | "F02" | "F03" | "F05" | "F09";
  seed: string;
  setup: {
    mode: GameMode;
    playerCount: 2;
    enabledExpansions: ExpansionId[];
    playerNationIds: Record<string, string>;
  };
  steps: GuidedStep[];
};

export const GUIDED_CHAPTERS: GuidedChapter[] = [
  {
    id: "commit-action",
    number: 1,
    title: "Commit an Action",
    scenarioId: "F01",
    seed: "fictional-F01-v2",
    setup: { mode: "multiplayer", playerCount: 2, enabledExpansions: [], playerNationIds: { "1": "fixture_nation_progressors", "2": "fixture_nation_progressors" } },
    steps: [
      {
        id: "play-foundry-lantern",
        title: "Play Foundry Lantern",
        instruction: "Select Foundry Lantern in Player 1's hand, review its payment preview, then choose Play.",
        rule: "Playing an Action spends an Action. It does not spend an Exhaust token.",
        targetCardIds: ["fixture_action_gain_materials"]
      }
    ]
  },
  {
    id: "progression",
    number: 2,
    title: "Cross a Milestone",
    resetNotice: "This chapter restarts the Milestone Cooperative fixture so its first reshuffle can be observed cleanly.",
    scenarioId: "F01",
    seed: "fictional-F01-v2",
    setup: { mode: "multiplayer", playerCount: 2, enabledExpansions: [], playerNationIds: { "1": "fixture_nation_progressors", "2": "fixture_nation_progressors" } },
    steps: [
      {
        id: "prepare-reshuffle",
        title: "Use the opening Action",
        instruction: "Play Foundry Lantern, then finish turns with ordinary board controls until Player 1 reshuffles.",
        rule: "The card play spends one Action. The later reshuffle uses the separate progression lifecycle.",
        targetCardIds: ["fixture_action_gain_materials"]
      },
      {
        id: "nation-milestone",
        title: "Resolve the Nation milestone",
        instruction: "Continue until Milestone Charter enters Player 1's hand after the reshuffle.",
        rule: "This milestone spends one Exhaust token, advances Nation progression, and does not spend an Action.",
        targetCardIds: ["fixture_nation_milestone"]
      }
    ]
  },
  {
    id: "reaction",
    number: 3,
    title: "Answer a Reaction",
    resetNotice: "This chapter starts a purpose-built Wayfinder position.",
    scenarioId: "F03",
    seed: "fictional-F03-v2",
    setup: { mode: "multiplayer", playerCount: 2, enabledExpansions: [], playerNationIds: { "1": "fixture_nation_wayfinders", "2": "fixture_nation_wayfinders" } },
    steps: [
      {
        id: "open-reaction",
        title: "Open the reaction window",
        instruction: "Play Greenway Region from Player 1's hand.",
        rule: "Its resource gain opens the required reactive Exhaust choice before play finishes.",
        targetCardIds: ["fixture_region_greenway"]
      },
      {
        id: "resolve-reaction",
        title: "Use Wayfinder Network",
        instruction: "Choose Wayfinder Network in the required reaction panel.",
        rule: "Resolving the reaction spends one Exhaust token and gains one Influence.",
        targetCardIds: ["fixture_power_wayfinder"]
      },
      {
        id: "garrison-unit",
        title: "Garrison Pathfinder Unit",
        instruction: "Resolve the garrison choice by attaching Pathfinder Unit to Greenway Region.",
        rule: "The Unit leaves the hand and is attached to the Region in play.",
        targetCardIds: ["fixture_unit_pathfinder", "fixture_region_greenway"]
      },
      {
        id: "recall-region",
        title: "Recall the Region",
        instruction: "Recall Greenway Region with its ordinary legal action.",
        rule: "Recall returns both the Region and its garrisoned Unit to hand.",
        targetCardIds: ["fixture_region_greenway"]
      }
    ]
  },
  {
    id: "trade",
    number: 4,
    title: "Trade Through a Route",
    resetNotice: "This chapter starts a two-seat Canal Exchange position with Trade Routes enabled.",
    scenarioId: "F02",
    seed: "F02",
    setup: { mode: "multiplayer", playerCount: 2, enabledExpansions: ["trade_routes"], playerNationIds: { "1": "fixture_nation_traders", "2": "fixture_nation_traders" } },
    steps: [
      {
        id: "establish-route",
        title: "Establish Sluiceway Route",
        instruction: "Player 1 plays Sluiceway Route, then passes control to Player 2 when the turn allows.",
        rule: "A Trade action can target only a currently legal Route.",
        targetCardIds: ["fixture_trade_route_sluice"]
      },
      {
        id: "trade-route",
        title: "Trade through the opponent Route",
        instruction: "Player 2 plays Canal Exchange and chooses Sluiceway Route.",
        rule: "The trade resolves through the highlighted opponent Route and places its resource there.",
        targetCardIds: ["fixture_action_trade_goods", "fixture_trade_route_sluice"]
      },
      {
        id: "open-acquire",
        title: "Open a Market choice",
        instruction: "Player 2 plays Market Lens to open its typed acquisition choice.",
        rule: "Only cards listed by the engine are legal targets.",
        targetCardIds: ["fixture_action_choose_market"]
      },
      {
        id: "acquire-petition",
        title: "Acquire Pressure Forum",
        instruction: "Choose Pressure Forum from the highlighted Market targets.",
        rule: "The selected card moves to the destination declared by the real effect: Player 2's hand.",
        targetCardIds: ["fixture_market_unrest"]
      }
    ]
  },
  {
    id: "ordering",
    number: 5,
    title: "Arrange the Solstice",
    resetNotice: "This chapter starts a purpose-built Dawn Timekeeper position.",
    scenarioId: "F09",
    seed: "fictional-F09-v2",
    setup: { mode: "multiplayer", playerCount: 2, enabledExpansions: [], playerNationIds: { "1": "fixture_nation_timekeepers", "2": "fixture_nation_timekeepers" } },
    steps: [
      {
        id: "open-ordering",
        title: "Reach the Solstice",
        instruction: "Finish both ordinary turns and resolve their cleanup choices until the Solstice ordering panel opens.",
        rule: "Multiple order-sensitive Solstice cards pause the round before any of those effects resolve.",
        targetCardIds: ["fixture_power_dawn_store", "fixture_power_dawn_toll"]
      },
      {
        id: "resolve-ordering",
        title: "Choose each effect order",
        instruction: "Arrange Dawn Storehouse and Dawn Tollhouse, confirm the order, then do the same for Player 2.",
        rule: "The engine resolves the submitted adjacent order exactly once, then advances to round 2.",
        targetCardIds: ["fixture_power_dawn_store", "fixture_power_dawn_toll"]
      }
    ]
  },
  {
    id: "scoring",
    number: 6,
    title: "Close and Score",
    resetNotice: "This final chapter starts the bounded Lantern Scorekeepers endgame.",
    scenarioId: "F05",
    seed: "F05",
    setup: { mode: "multiplayer", playerCount: 2, enabledExpansions: [], playerNationIds: { "1": "fixture_nation_scorekeepers", "2": "fixture_nation_scorekeepers" } },
    steps: [
      {
        id: "open-final-round",
        title: "Open the final round",
        instruction: "Each player plays Closing Bell and finishes the turn.",
        rule: "Normal scoring waits for the current and final rounds; it does not end at the first Bell.",
        targetCardIds: ["fixture_action_score_bell"]
      },
      {
        id: "finish-scoring",
        title: "Finish and inspect scoring",
        instruction: "Finish both final turns, then inspect the score breakdown.",
        rule: "Each player scores 2 fixed VP + 1 Progress VP + 0 resource VP = 3 VP.",
        targetCardIds: ["fixture_action_score_bell"]
      }
    ]
  }
];

export function getGuidedChapter(id: GuidedChapterId): GuidedChapter {
  const chapter = GUIDED_CHAPTERS.find((candidate) => candidate.id === id);
  if (!chapter) throw new Error(`Unknown guided chapter: ${id}`);
  return chapter;
}

function inPlayerZone(G: GameState, playerId: string, zone: "hand" | "playArea", cardId: string): boolean {
  return G.players[playerId]?.[zone]?.includes(cardId) ?? false;
}

function logContains(G: GameState, text: string): boolean {
  return G.log.some((entry) => entry.message.includes(text));
}

function stepComplete(chapterId: GuidedChapterId, stepId: string, G: GameState): boolean {
  const p1 = G.players["1"];
  const p2 = G.players["2"];
  switch (`${chapterId}:${stepId}`) {
    case "commit-action:play-foundry-lantern":
    case "progression:prepare-reshuffle":
      return Boolean(p1?.resources.materials === 4 && p1.actionsRemaining === 2 && p1.exhaustTokensAvailable === 1 && logContains(G, "playCard(fixture_action_gain_materials)"));
    case "progression:nation-milestone":
      return Boolean(p1?.progressionTokens?.nationDeck === 1 && p1.progressionTokens.developmentArea === 0 && p1.exhaustTokensAvailable === 0 && logContains(G, "NationCardAdded"));
    case "reaction:open-reaction":
      return Boolean(logContains(G, "playCard(fixture_region_greenway)"));
    case "reaction:resolve-reaction":
      return Boolean(p1?.resources.influence === 3 && p1.exhaustTokensAvailable === 0 && logContains(G, "ReactiveExhaustResolved(fixture_power_wayfinder)"));
    case "reaction:garrison-unit":
      return logContains(G, "GarrisonChoiceResolved(") && logContains(G, "fixture_unit_pathfinder->fixture_region_greenway");
    case "reaction:recall-region":
      return logContains(G, "RegionRecalled(fixture_region_greenway/garrisoned=1)");
    case "trade:establish-route":
      return Boolean(inPlayerZone(G, "1", "playArea", "fixture_trade_route_sluice"));
    case "trade:trade-route":
      return Boolean(p2?.resources.goods === 2 && G.cardStates?.fixture_trade_route_sluice?.resources?.goods === 1 && logContains(G, "TradeChoiceResolved(opponent_route/fixture_trade_route_sluice)"));
    case "trade:open-acquire":
      return Boolean(logContains(G, "playCard(fixture_action_choose_market)"));
    case "trade:acquire-petition":
      return Boolean(!G.pendingAcquireChoice && inPlayerZone(G, "2", "hand", "fixture_market_unrest"));
    case "ordering:open-ordering":
      return logContains(G, "SolsticeOrderChoicePending(on_solstice/cards=2)");
    case "ordering:resolve-ordering":
      return Boolean(G.round >= 2 && !G.pendingSolsticeOrderChoice && logContains(G, "SolsticeOrderChoiceResolved(on_solstice/cards=2)"));
    case "scoring:open-final-round":
      return Boolean(G.round >= 2 && (G.scoring || G.gameover));
    case "scoring:finish-scoring":
      return Boolean(G.gameover?.reason === "normal_scoring:fictional_closing_bell" && G.gameover.winner === "1,2" && G.gameover.scores?.["1"] === 3 && G.gameover.scores?.["2"] === 3);
    default:
      return false;
  }
}

export function deriveGuidedProgress(chapterId: GuidedChapterId, G: GameState): number {
  const chapter = getGuidedChapter(chapterId);
  let completed = 0;
  for (const step of chapter.steps) {
    if (!stepComplete(chapterId, step.id, G)) break;
    completed += 1;
  }
  return completed;
}

export type GuidedGameSave = {
  version: 1;
  lessonVersion: number;
  fixtureVersion: number;
  rulesVersion: number;
  chapterId: GuidedChapterId;
  progress: number;
  savedAtIso: string;
  snapshot: SavedLocalGameEnvelope;
};

export type GuidedGameSaveRecord =
  | { kind: "none" }
  | { kind: "valid"; save: GuidedGameSave }
  | { kind: "incompatible" | "corrupt"; reason: string; raw: string };

export function serializeGuidedGame(input: { chapterId: GuidedChapterId; state: unknown; now?: Date }): string {
  const chapter = getGuidedChapter(input.chapterId);
  const savedAtIso = (input.now ?? new Date()).toISOString();
  const snapshot = JSON.parse(serializeLocalGame({
    privateDataFingerprint: `public-fictional-v${PUBLIC_FICTIONAL_FIXTURE_VERSION}`,
    state: input.state,
    now: new Date(savedAtIso),
    slotName: `Learning: ${chapter.title}`,
    snapshotSource: "authoritative-local"
  })) as SavedLocalGameEnvelope;
  return JSON.stringify({
    version: 1,
    lessonVersion: GUIDED_GAME_LESSON_VERSION,
    fixtureVersion: PUBLIC_FICTIONAL_FIXTURE_VERSION,
    rulesVersion: CURRENT_RULES_VERSION,
    chapterId: input.chapterId,
    progress: deriveGuidedProgress(input.chapterId, (input.state as any).G),
    savedAtIso,
    snapshot
  } satisfies GuidedGameSave);
}

export function inspectGuidedGame(raw: string): GuidedGameSaveRecord {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { kind: "corrupt", reason: "Learning save is not valid JSON. Its original bytes are preserved.", raw }; }
  if (!parsed || typeof parsed !== "object") return { kind: "corrupt", reason: "Learning save is not an object. Its original bytes are preserved.", raw };
  const value = parsed as Partial<GuidedGameSave>;
  if (value.version !== 1 || value.lessonVersion !== GUIDED_GAME_LESSON_VERSION || value.fixtureVersion !== PUBLIC_FICTIONAL_FIXTURE_VERSION || value.rulesVersion !== CURRENT_RULES_VERSION) {
    return { kind: "incompatible", reason: "Learning save belongs to a different lesson, fixture, or rules version. It was not applied.", raw };
  }
  if (!GUIDED_CHAPTERS.some((chapter) => chapter.id === value.chapterId) || !Number.isInteger(value.progress) || typeof value.savedAtIso !== "string" || !value.snapshot) {
    return { kind: "corrupt", reason: "Learning save metadata is invalid. Its original bytes are preserved.", raw };
  }
  const chapterId = value.chapterId as GuidedChapterId;
  const snapshot = inspectLocalGameExport(JSON.stringify(value.snapshot));
  if (snapshot.kind !== "playable") return { kind: "incompatible", reason: `Learning snapshot cannot be resumed: ${snapshot.reason}`, raw };
  const chapter = getGuidedChapter(chapterId);
  const G = (snapshot.envelope.state as any)?.G as GameState | undefined;
  if (!G || G.options?.commonsSetId !== "custom" || G.options?.mode !== chapter.setup.mode || G.options?.playerCount !== chapter.setup.playerCount) {
    return { kind: "corrupt", reason: "Learning snapshot does not match its chapter setup. It was not applied.", raw };
  }
  const derivedProgress = deriveGuidedProgress(chapter.id, G);
  return { kind: "valid", save: { ...value as GuidedGameSave, progress: derivedProgress, snapshot: snapshot.envelope } };
}

export function loadGuidedGame(storage: Pick<Storage, "getItem"> | undefined): GuidedGameSaveRecord {
  const raw = storage?.getItem(GUIDED_GAME_STORAGE_KEY);
  return raw ? inspectGuidedGame(raw) : { kind: "none" };
}

export function nextGuidedChapterId(id: GuidedChapterId): GuidedChapterId | undefined {
  return GUIDED_CHAPTERS[GUIDED_CHAPTERS.findIndex((chapter) => chapter.id === id) + 1]?.id;
}
