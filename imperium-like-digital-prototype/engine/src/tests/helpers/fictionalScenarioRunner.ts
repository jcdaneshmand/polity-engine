import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialGameState } from "../../game/initialState";
import {
  endTurnMove,
  garrisonCard,
  playCard,
  recallRegion,
  resolveAcquireChoice,
  resolveCleanupDiscard,
  resolveCleanupMarketResource,
  resolveReactiveExhaustChoice,
  resolveSolsticeOrderChoice
} from "../../game/moves";
import type { GameState, ResourceName } from "../../game/state";
import { onTurnEnd } from "../../game/turn";
import { inspectGameStateCompatibility, CURRENT_RULES_VERSION } from "../../game/version";
import { drawCardWithReshuffleLifecycle } from "../../game/zones";
import { seededRandom } from "../../setup/setupPipeline";

const thisDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FICTIONAL_FIXTURE_ROOT = path.resolve(thisDirectory, "../../../../data/fictional-regression");
export const REQUIRED_FICTIONAL_SCENARIO_IDS = ["F01", "F02", "F03", "F04", "F05", "F06", "F07", "F07-SOLO", "F08-3P", "F08-4P", "F09"] as const;

const STEP_TYPES = new Set([
  "play_card",
  "draw_with_reshuffle",
  "resolve_reactive_exhaust",
  "garrison",
  "recall_region",
  "restore",
  "resolve_acquire_choice",
  "resolve_solstice_order",
  "finish_turn",
  "boundary_solstice",
  "checkpoint"
]);
const CHECK_TYPES = new Set([
  "resource",
  "bot_resource",
  "token",
  "zone_contains",
  "zone_excludes",
  "pending",
  "progression_tokens",
  "garrison",
  "card_resource",
  "round",
  "gameover",
  "log_contains",
  "ordered_log_players",
  "no_invalid_moves"
]);

type ScenarioKind = "executable_sequence" | "full_game" | "constructed_boundary";
type PlayerZone = "hand" | "deck" | "discard" | "playArea" | "history" | "exile" | "powerArea" | "stateArea" | "developmentArea" | "nationDeck";

export type FictionalCheck =
  | { type: "resource"; playerId: string; resource: ResourceName; equals: number }
  | { type: "bot_resource"; resource: ResourceName; equals: number }
  | { type: "token"; playerId: string; token: "actionsRemaining" | "actionTokensAvailable" | "exhaustTokensAvailable"; equals: number }
  | { type: "zone_contains" | "zone_excludes"; playerId: string; zone: PlayerZone; cardId: string }
  | { type: "pending"; pending: keyof GameState; exists: boolean }
  | { type: "progression_tokens"; playerId: string; nationDeck: number; developmentArea: number }
  | { type: "garrison"; hostCardId: string; cardId: string; exists: boolean }
  | { type: "card_resource"; cardId: string; resource: ResourceName; equals: number }
  | { type: "round"; equals: number }
  | { type: "gameover"; winner: string; reason: string; scores: Record<string, number> }
  | { type: "log_contains"; text: string }
  | { type: "ordered_log_players"; message: string; playerIds: string[] }
  | { type: "no_invalid_moves" };

export type FictionalStep =
  | { type: "play_card"; actor: string; cardId: string }
  | { type: "draw_with_reshuffle"; actor: string }
  | { type: "resolve_reactive_exhaust"; actor: string; cardId: string }
  | { type: "garrison"; actor: string; hostCardId: string; cardId: string }
  | { type: "recall_region"; actor: string; cardId: string }
  | { type: "restore" }
  | { type: "resolve_acquire_choice"; actor: string; cardId?: string; index?: number }
  | { type: "resolve_solstice_order"; actor: string; cardIds?: string[] }
  | { type: "finish_turn"; actor: string }
  | { type: "boundary_solstice"; sourcePlayerId: string; cardId: string }
  | { type: "checkpoint"; id: string; checks: FictionalCheck[] };

export interface FictionalScenario {
  id: string;
  title: string;
  kind: ScenarioKind;
  description: string;
  seed: string;
  tags: string[];
  sourceReferences: string[];
  setup: {
    mode: "multiplayer" | "solo" | "practice";
    playerCount: number;
    commonsSetId: string;
    enabledExpansions: string[];
    enabledVariants: string[];
    soloDifficulty?: string;
  };
  playerNationIds: Record<string, string>;
  soloBotNationId?: string;
  steps: FictionalStep[];
  expectedTerminal?: { winner: string; reason: string; scores: Record<string, number>; arithmetic: string[] };
}

export interface FictionalScenarioCatalog {
  fixtureVersion: number;
  rulesVersion: number;
  requiredScenarioIds: string[];
  scenarios: FictionalScenario[];
}

export interface FictionalScenarioReport {
  id: string;
  kind: ScenarioKind;
  seed: string;
  checkpoints: number;
  terminalReason?: string;
  expectedScores?: Record<string, number>;
  actualScores?: Record<string, number>;
  failures: string[];
}

function fail(message: string): never {
  throw new Error(`FictionalScenarioValidation: ${message}`);
}

function record(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, any>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) fail(`${label} must be a string array`);
  return value as string[];
}

function validateCheck(value: unknown, label: string): FictionalCheck {
  const check = record(value, label);
  const type = string(check.type, `${label}.type`);
  if (!CHECK_TYPES.has(type)) fail(`${label} has unknown check type ${type}`);
  if (type === "ordered_log_players") stringArray(check.playerIds, `${label}.playerIds`);
  if (type === "gameover") record(check.scores, `${label}.scores`);
  return check as FictionalCheck;
}

function validateStep(value: unknown, scenarioId: string, index: number): FictionalStep {
  const label = `${scenarioId}.steps[${index}]`;
  const step = record(value, label);
  const type = string(step.type, `${label}.type`);
  if (!STEP_TYPES.has(type)) fail(`${label} has unknown step type ${type}`);
  if (type === "checkpoint") {
    string(step.id, `${label}.id`);
    if (!Array.isArray(step.checks) || step.checks.length === 0) fail(`${label}.checks must be a non-empty array`);
    step.checks.forEach((check: unknown, checkIndex: number) => validateCheck(check, `${label}.checks[${checkIndex}]`));
  }
  return step as FictionalStep;
}

export function validateFictionalScenarioCatalog(value: unknown): FictionalScenarioCatalog {
  const catalog = record(value, "catalog");
  if (!Number.isInteger(catalog.fixtureVersion) || catalog.fixtureVersion < 1) fail("fixtureVersion must be a positive integer");
  if (catalog.rulesVersion !== CURRENT_RULES_VERSION) fail(`rulesVersion must be ${CURRENT_RULES_VERSION}`);
  const requiredScenarioIds = stringArray(catalog.requiredScenarioIds, "requiredScenarioIds");
  if (!Array.isArray(catalog.scenarios)) fail("scenarios must be an array");
  const seen = new Set<string>();
  for (const [index, rawScenario] of catalog.scenarios.entries()) {
    const scenario = record(rawScenario, `scenarios[${index}]`);
    const id = string(scenario.id, `scenarios[${index}].id`);
    if (seen.has(id)) fail(`duplicate scenario ${id}`);
    seen.add(id);
    if (!["executable_sequence", "full_game", "constructed_boundary"].includes(scenario.kind)) fail(`${id}.kind is unsupported`);
    string(scenario.title, `${id}.title`);
    string(scenario.description, `${id}.description`);
    string(scenario.seed, `${id}.seed`);
    stringArray(scenario.tags, `${id}.tags`);
    stringArray(scenario.sourceReferences, `${id}.sourceReferences`);
    const setup = record(scenario.setup, `${id}.setup`);
    if (!["multiplayer", "solo", "practice"].includes(setup.mode)) fail(`${id}.setup.mode is unsupported`);
    if (!Number.isInteger(setup.playerCount) || setup.playerCount < 1 || setup.playerCount > 4) fail(`${id}.setup.playerCount must be 1-4`);
    record(scenario.playerNationIds, `${id}.playerNationIds`);
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) fail(`${id}.steps must be a non-empty array`);
    scenario.steps.forEach((step: unknown, stepIndex: number) => validateStep(step, id, stepIndex));
    if (scenario.kind === "full_game" && !scenario.expectedTerminal) fail(`${id} full_game requires expectedTerminal`);
    if (scenario.expectedTerminal) {
      const terminal = record(scenario.expectedTerminal, `${id}.expectedTerminal`);
      string(terminal.winner, `${id}.expectedTerminal.winner`);
      string(terminal.reason, `${id}.expectedTerminal.reason`);
      record(terminal.scores, `${id}.expectedTerminal.scores`);
      if (stringArray(terminal.arithmetic, `${id}.expectedTerminal.arithmetic`).length === 0) fail(`${id}.expectedTerminal.arithmetic cannot be empty`);
    }
  }
  for (const id of requiredScenarioIds) if (!seen.has(id)) fail(`required scenario ${id} is missing`);
  for (const id of REQUIRED_FICTIONAL_SCENARIO_IDS) if (!seen.has(id)) fail(`engine-required scenario ${id} is missing`);
  return catalog as FictionalScenarioCatalog;
}

export function loadFictionalScenarioCatalog(fixtureRoot = DEFAULT_FICTIONAL_FIXTURE_ROOT): FictionalScenarioCatalog {
  return validateFictionalScenarioCatalog(JSON.parse(fs.readFileSync(path.join(fixtureRoot, "scenarios.json"), "utf8")));
}

function readFixture<T>(fixtureRoot: string, fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, fileName), "utf8")) as T;
}

function privateFixtureBundle(fixtureRoot: string) {
  return {
    cards: readFixture<any[]>(fixtureRoot, "cards.json"),
    nations: readFixture<any[]>(fixtureRoot, "nations.json"),
    nationRulesets: readFixture<any[]>(fixtureRoot, "rulesets.json"),
    botStateTables: {},
    botTradeRoutesTables: {}
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function playerZone(G: GameState, playerId: string, zone: PlayerZone): string[] {
  const player = G.players[playerId];
  assert(player, `unknown player ${playerId}`);
  return player[zone] as string[];
}

function runCheck(G: GameState, check: FictionalCheck, scenarioId: string, checkpointId: string): void {
  const label = `${scenarioId}/${checkpointId}/${check.type}`;
  switch (check.type) {
    case "resource":
      assert(G.players[check.playerId]?.resources[check.resource] === check.equals, `${label}: expected ${check.equals}`);
      break;
    case "bot_resource":
      assert(G.solo?.bot.resources[check.resource] === check.equals, `${label}: expected ${check.equals}`);
      break;
    case "token":
      assert(G.players[check.playerId]?.[check.token] === check.equals, `${label}: expected ${check.equals}`);
      break;
    case "zone_contains":
      assert(playerZone(G, check.playerId, check.zone).includes(check.cardId), `${label}: ${check.cardId} missing from ${check.zone}`);
      break;
    case "zone_excludes":
      assert(!playerZone(G, check.playerId, check.zone).includes(check.cardId), `${label}: ${check.cardId} unexpectedly in ${check.zone}`);
      break;
    case "pending":
      assert(Boolean(G[check.pending]) === check.exists, `${label}: expected ${String(check.pending)} exists=${check.exists}`);
      break;
    case "progression_tokens": {
      const tokens = G.players[check.playerId]?.progressionTokens;
      assert(tokens?.nationDeck === check.nationDeck && tokens.developmentArea === check.developmentArea, `${label}: progression token mismatch`);
      break;
    }
    case "garrison":
      assert((G.cardStates?.[check.hostCardId]?.garrisonedCardIds ?? []).includes(check.cardId) === check.exists, `${label}: garrison mismatch`);
      break;
    case "card_resource":
      assert((G.cardStates?.[check.cardId]?.resources?.[check.resource] ?? 0) === check.equals, `${label}: card resource mismatch`);
      break;
    case "round":
      assert(G.round === check.equals, `${label}: expected round ${check.equals}, got ${G.round}`);
      break;
    case "gameover":
      assert(G.gameover?.winner === check.winner, `${label}: expected winner ${check.winner}, got ${G.gameover?.winner}`);
      assert(G.gameover?.reason === check.reason, `${label}: expected reason ${check.reason}, got ${G.gameover?.reason}`);
      assert(JSON.stringify(G.gameover?.scores) === JSON.stringify(check.scores), `${label}: score mismatch expected=${JSON.stringify(check.scores)} actual=${JSON.stringify(G.gameover?.scores)}`);
      break;
    case "log_contains":
      assert(G.log.some((entry) => entry.message.includes(check.text)), `${label}: log lacks ${check.text}`);
      break;
    case "ordered_log_players": {
      const actual = G.log.filter((entry) => entry.message === check.message).map((entry) => entry.playerId);
      assert(JSON.stringify(actual) === JSON.stringify(check.playerIds), `${label}: order expected=${check.playerIds.join(",")} actual=${actual.join(",")}`);
      break;
    }
    case "no_invalid_moves":
      assert(!G.log.some((entry) => entry.message.startsWith("InvalidMove(")), `${label}: invalid move logged`);
      break;
  }
}

function finishTurn(G: GameState, actor: string, randomNumber: () => number): void {
  const ctx = { currentPlayer: actor, playOrder: G.playOrder ?? Object.keys(G.players) } as any;
  const random = { Number: randomNumber };
  const events = { endTurn: () => onTurnEnd(G, ctx, randomNumber) };
  endTurnMove({ G, ctx, random, events });
  for (let guard = 0; guard < 16 && (G.pendingCleanupMarketResourceChoice || G.pendingCleanupDiscardChoice); guard += 1) {
    if (G.pendingCleanupMarketResourceChoice) {
      resolveCleanupMarketResource({ G, ctx, random, events }, G.pendingCleanupMarketResourceChoice.cardIds[0]);
    } else if (G.pendingCleanupDiscardChoice) {
      resolveCleanupDiscard({ G, ctx, random, events }, []);
    }
  }
  assert(!G.pendingCleanupMarketResourceChoice && !G.pendingCleanupDiscardChoice, `finish_turn(${actor}) exceeded cleanup guard`);
}

function constructSolsticeBoundary(G: GameState, scenario: FictionalScenario, sourcePlayerId: string, cardId: string): void {
  assert(scenario.kind === "constructed_boundary", `${scenario.id}: boundary_solstice requires constructed_boundary kind`);
  assert(G.players[sourcePlayerId], `${scenario.id}: unknown Solstice source ${sourcePlayerId}`);
  for (const player of Object.values(G.players)) {
    player.resources = { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 };
    player.playArea = [];
    player.powerArea = [];
  }
  G.players[sourcePlayerId].playArea = [cardId];
  G.log = [];
  const playOrder = G.playOrder ?? Object.keys(G.players);
  onTurnEnd(G, { currentPlayer: playOrder.at(-1)!, playOrder } as any);
}

export function runFictionalScenario(scenario: FictionalScenario, fixtureRoot = DEFAULT_FICTIONAL_FIXTURE_ROOT): FictionalScenarioReport {
  let G = createInitialGameState({
    options: scenario.setup as any,
    playerNationIds: scenario.playerNationIds,
    soloBotNationId: scenario.soloBotNationId,
    randomSeed: scenario.seed,
    privateData: privateFixtureBundle(fixtureRoot)
  });
  let checkpoints = 0;
  for (const [index, step] of scenario.steps.entries()) {
    const randomNumber = seededRandom(`${scenario.seed}:step:${index}`) ?? (() => 0);
    const ctx = "actor" in step ? { currentPlayer: step.actor, playOrder: G.playOrder ?? Object.keys(G.players) } as any : undefined;
    const invalidBefore = G.log.filter((entry) => entry.message.startsWith("InvalidMove(")).length;
    switch (step.type) {
      case "play_card":
        playCard({ G, ctx, random: { Number: randomNumber } } as any, step.cardId);
        break;
      case "draw_with_reshuffle":
        drawCardWithReshuffleLifecycle(G, step.actor, randomNumber);
        break;
      case "resolve_reactive_exhaust":
        resolveReactiveExhaustChoice({ G, ctx, random: { Number: randomNumber } } as any, step.cardId);
        break;
      case "garrison":
        garrisonCard({ G, ctx } as any, step.hostCardId, step.cardId);
        break;
      case "recall_region":
        recallRegion({ G, ctx } as any, step.cardId);
        break;
      case "restore": {
        const restored = JSON.parse(JSON.stringify(G));
        assert(inspectGameStateCompatibility(restored).kind === "current", `${scenario.id}: restored state is not current-compatible`);
        G = restored;
        break;
      }
      case "resolve_acquire_choice": {
        const pending = G.pendingAcquireChoice;
        assert(pending, `${scenario.id}: no pending acquire choice`);
        const cardId = step.cardId ?? pending.cardIds[step.index ?? 0];
        assert(cardId && pending.cardIds.includes(cardId), `${scenario.id}: requested acquire choice is unavailable`);
        resolveAcquireChoice({ G, ctx, random: { Number: randomNumber } } as any, cardId);
        break;
      }
      case "resolve_solstice_order": {
        const pending = G.pendingSolsticeOrderChoice;
        assert(pending, `${scenario.id}: no pending Solstice order choice`);
        const cardIds = step.cardIds ?? pending.cardIds;
        resolveSolsticeOrderChoice({ G, ctx, random: { Number: randomNumber } } as any, cardIds);
        break;
      }
      case "finish_turn":
        finishTurn(G, step.actor, randomNumber);
        break;
      case "boundary_solstice":
        constructSolsticeBoundary(G, scenario, step.sourcePlayerId, step.cardId);
        break;
      case "checkpoint":
        checkpoints += 1;
        for (const check of step.checks) runCheck(G, check, scenario.id, step.id);
        break;
    }
    const invalidAfter = G.log.filter((entry) => entry.message.startsWith("InvalidMove(")).length;
    assert(invalidAfter === invalidBefore, `${scenario.id}: step ${index} (${step.type}) logged an invalid move`);
  }
  if (scenario.kind === "full_game") assert(G.gameover, `${scenario.id}: full game did not terminate`);
  if (scenario.expectedTerminal) {
    runCheck(G, { type: "gameover", ...scenario.expectedTerminal }, scenario.id, "expected-terminal");
  }
  return {
    id: scenario.id,
    kind: scenario.kind,
    seed: scenario.seed,
    checkpoints,
    terminalReason: G.gameover?.reason,
    expectedScores: scenario.expectedTerminal?.scores,
    actualScores: G.gameover?.scores,
    failures: []
  };
}

export function runFictionalScenarioCatalog(catalog: FictionalScenarioCatalog, fixtureRoot = DEFAULT_FICTIONAL_FIXTURE_ROOT): FictionalScenarioReport[] {
  validateFictionalScenarioCatalog(catalog);
  return catalog.scenarios.map((scenario) => runFictionalScenario(scenario, fixtureRoot));
}
