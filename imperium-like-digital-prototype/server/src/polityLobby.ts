import { randomUUID } from "node:crypto";
import type { LobbyStore } from "./lobbyStore";
import type { ListedMatch, LobbyAccessFailureReason } from "./lobbyTypes";

type KoaLikeContext = {
  method: string;
  path: string;
  request?: { body?: unknown };
  req?: AsyncIterable<Buffer | string>;
  status?: number;
  body?: unknown;
};

type KoaLikeNext = () => Promise<void>;

type BoardgameApi = {
  createMatch: (input: { numPlayers: number; setupData: unknown }) => Promise<{ matchID: string }>;
  joinMatch: (input: { matchID: string; playerID: string; playerName: string }) => Promise<{ playerCredentials: string }>;
};

type PolityLobbyOptions = {
  store: LobbyStore;
  boardgameApi: BoardgameApi;
  createSpectatorCredentials?: () => string;
};

type CreateMatchBody = {
  roomName?: unknown;
  numPlayers?: unknown;
  setupData?: unknown;
  privateDataFingerprint?: unknown;
  password?: unknown;
};

type JoinBody = {
  playerID?: unknown;
  playerName?: unknown;
  password?: unknown;
  privateDataFingerprint?: unknown;
};

type SpectateBody = {
  password?: unknown;
  privateDataFingerprint?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

async function readJSONBody(ctx: KoaLikeContext): Promise<unknown> {
  if (ctx.request && "body" in ctx.request) return ctx.request.body;
  if (!ctx.req) return undefined;
  let text = "";
  for await (const chunk of ctx.req) text += chunk.toString();
  if (!text.trim()) return undefined;
  return JSON.parse(text);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function playerCount(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value >= 1 && value <= 4 ? value : 2;
}

function accessStatus(reason: LobbyAccessFailureReason): number {
  if (reason === "match_not_found") return 404;
  if (reason === "private_data_mismatch") return 409;
  if (reason === "match_not_joinable" || reason === "match_full" || reason === "seat_unavailable") return 409;
  return 403;
}

function setError(ctx: KoaLikeContext, status: number, error: string): void {
  ctx.status = status;
  ctx.body = { error };
}

function matchRoute(path: string, suffix: "join" | "spectate"): string | undefined {
  const match = path.match(new RegExp(`^/polity/lobby/matches/([^/]+)/${suffix}$`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function createPolityLobbyMiddleware(options: PolityLobbyOptions) {
  const createSpectatorCredentials = options.createSpectatorCredentials ?? (() => `spectator:${randomUUID()}`);

  return async (ctx: KoaLikeContext, next: KoaLikeNext): Promise<void> => {
    if (!ctx.path.startsWith("/polity/lobby")) {
      await next();
      return;
    }

    if (ctx.method === "GET" && ctx.path === "/polity/lobby/matches") {
      ctx.body = { matches: options.store.listMatches() };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/lobby/matches") {
      const body = await readJSONBody(ctx) as CreateMatchBody;
      if (!isRecord(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const numPlayers = playerCount(body.numPlayers);
      const setupData = body.setupData ?? {};
      const privateDataFingerprint = stringValue(body.privateDataFingerprint) ?? "placeholder";
      const created = await options.boardgameApi.createMatch({ numPlayers, setupData });
      const listed = options.store.createMatchMetadata({
        matchID: created.matchID,
        roomName: stringValue(body.roomName),
        playerCount: numPlayers,
        setupData,
        privateDataFingerprint,
        password: stringValue(body.password)
      });
      ctx.status = 201;
      ctx.body = listed;
      return;
    }

    const joinMatchID = matchRoute(ctx.path, "join");
    if (ctx.method === "POST" && joinMatchID) {
      const body = await readJSONBody(ctx) as JoinBody;
      if (!isRecord(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const access = options.store.validateAccess({
        matchID: joinMatchID,
        password: stringValue(body.password),
        privateDataFingerprint: stringValue(body.privateDataFingerprint) ?? "placeholder"
      });
      if (!access.ok) {
        setError(ctx, accessStatus(access.reason), access.reason);
        return;
      }
      const currentMatch = options.store.getMatch(joinMatchID);
      if (!currentMatch) {
        setError(ctx, 404, "match_not_found");
        return;
      }
      if (currentMatch.status !== "setup") {
        setError(ctx, 409, "match_not_joinable");
        return;
      }
      const requestedPlayerID = stringValue(body.playerID);
      const playerID = requestedPlayerID ?? currentMatch.availableSeats[0];
      if (!playerID) {
        setError(ctx, 409, "match_full");
        return;
      }
      if (!currentMatch.availableSeats.includes(playerID)) {
        setError(ctx, 409, "seat_unavailable");
        return;
      }
      const playerName = stringValue(body.playerName)?.trim() || `Player ${Number(playerID) + 1}`;
      const joined = await options.boardgameApi.joinMatch({ matchID: joinMatchID, playerID, playerName });
      const match = options.store.recordPlayerJoin({ matchID: joinMatchID, playerID, playerName }) as ListedMatch;
      ctx.body = { ...joined, playerID, match };
      return;
    }

    const spectateMatchID = matchRoute(ctx.path, "spectate");
    if (ctx.method === "POST" && spectateMatchID) {
      const body = await readJSONBody(ctx) as SpectateBody;
      if (!isRecord(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const access = options.store.validateAccess({
        matchID: spectateMatchID,
        password: stringValue(body.password),
        privateDataFingerprint: stringValue(body.privateDataFingerprint) ?? "placeholder"
      });
      if (!access.ok) {
        setError(ctx, accessStatus(access.reason), access.reason);
        return;
      }
      const match = options.store.getMatch(spectateMatchID);
      if (!match) {
        setError(ctx, 404, "match_not_found");
        return;
      }
      ctx.body = { spectatorCredentials: createSpectatorCredentials(), match };
      return;
    }

    await next();
  };
}

export function createBoardgameHttpApi(serverURL: string): BoardgameApi {
  const baseURL = serverURL.replace(/\/$/, "");
  return {
    async createMatch(input) {
      const response = await fetch(`${baseURL}/games/polity-engine/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ numPlayers: input.numPlayers, setupData: input.setupData })
      });
      if (!response.ok) throw new Error(`create_match_failed:${response.status}`);
      return await response.json() as { matchID: string };
    },
    async joinMatch(input) {
      const response = await fetch(`${baseURL}/games/polity-engine/${encodeURIComponent(input.matchID)}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerID: input.playerID, playerName: input.playerName })
      });
      if (!response.ok) throw new Error(`join_match_failed:${response.status}`);
      return await response.json() as { playerCredentials: string };
    }
  };
}
