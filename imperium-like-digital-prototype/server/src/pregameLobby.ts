import type { PregameLobbyStore } from "./pregameLobbyStore";
import type { LobbyAccessFailureReason, LobbySetupData } from "./pregameLobbyTypes";
import type { LobbyStore } from "./lobbyStore";

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

type PregameLobbyOptions = {
  store: PregameLobbyStore;
  boardgameApi: BoardgameApi;
  matchStore?: LobbyStore;
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

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function playerCount(value: unknown): number {
  return Number.isInteger(value) && typeof value === "number" && value >= 1 && value <= 4 ? value : 2;
}

function setupData(value: unknown): LobbySetupData {
  return isRecord(value) ? value as LobbySetupData : {};
}

function accessStatus(reason: LobbyAccessFailureReason | string): number {
  if (reason === "lobby_not_found") return 404;
  if (reason === "private_data_mismatch" || reason === "seat_unavailable" || reason === "duplicate_client" || reason === "lobby_already_started" || reason === "not_ready" || reason === "invalid_setup" || reason === "invalid_nation" || reason === "spectation_unavailable") return 409;
  if (reason === "invalid_chat") return 400;
  if (reason === "not_host" || reason === "invalid_credentials") return 403;
  return 403;
}

function setError(ctx: KoaLikeContext, status: number, error: string): void {
  ctx.status = status;
  ctx.body = { error };
}

function lobbyRoute(path: string, suffix: string): string | undefined {
  const match = path.match(new RegExp(`^/polity/lobby/rooms/([^/]+)/${suffix}$`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function credential(body: Record<string, unknown>): string | undefined {
  return stringValue(body.lobbyCredentials);
}

function finalizedSetup(baseSetup: LobbySetupData, seats: Array<{ seatID: string; selectedNationID: string }>): LobbySetupData {
  return {
    ...baseSetup,
    playerNationIds: Object.fromEntries(seats.map((seat) => [seat.seatID, seat.selectedNationID]))
  };
}

export function createPregameLobbyMiddleware(options: PregameLobbyOptions) {
  return async (ctx: KoaLikeContext, next: KoaLikeNext): Promise<void> => {
    if (!ctx.path.startsWith("/polity/lobby/rooms") && ctx.path !== "/polity/lobby/chat" && ctx.path !== "/polity/lobby/admin/clear") {
      await next();
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/lobby/admin/clear") {
      ctx.body = {
        ok: true,
        lobbiesCleared: options.store.clearLobbies(),
        matchesCleared: options.matchStore?.clearMatches() ?? 0
      };
      return;
    }

    if (ctx.method === "GET" && ctx.path === "/polity/lobby/chat") {
      ctx.body = { messages: options.store.listLoungeChat() };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/lobby/chat") {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !stringValue(body.text)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const text = stringValue(body.text) as string;
      const result = options.store.postLoungeChat({
        author: stringValue(body.author) ?? "Player",
        text
      });
      if (!result.ok) {
        setError(ctx, accessStatus(result.reason), result.reason);
        return;
      }
      ctx.body = { message: result.message };
      return;
    }

    if (ctx.method === "GET" && ctx.path === "/polity/lobby/rooms") {
      ctx.body = { lobbies: options.store.listLobbies() };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/lobby/rooms") {
      const body = await readJSONBody(ctx);
      if (!isRecord(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const created = options.store.createLobby({
        roomName: stringValue(body.roomName),
        playerCount: playerCount(body.playerCount),
        setupData: setupData(body.setupData),
        privateDataFingerprint: stringValue(body.privateDataFingerprint) ?? "placeholder",
        password: stringValue(body.password),
        hostName: stringValue(body.hostName),
        clientID: stringValue(body.clientID)
      });
      ctx.status = 201;
      ctx.body = created;
      return;
    }

    const getLobbyID = ctx.path.match(/^\/polity\/lobby\/rooms\/([^/]+)$/)?.[1];
    if (ctx.method === "POST" && getLobbyID) {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !credential(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const lobby = options.store.getLobbyForCredentials(decodeURIComponent(getLobbyID), credential(body) as string);
      if (!lobby) {
        setError(ctx, 403, "invalid_credentials");
        return;
      }
      ctx.body = { lobby };
      return;
    }

    const chatLobbyID = lobbyRoute(ctx.path, "chat");
    if (ctx.method === "POST" && chatLobbyID) {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !credential(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const result = options.store.listLobbyChat({ lobbyID: chatLobbyID, lobbyCredentials: credential(body) as string });
      if (!result.ok) {
        setError(ctx, accessStatus(result.reason), result.reason);
        return;
      }
      ctx.body = { messages: result.messages };
      return;
    }

    const sendChatLobbyID = lobbyRoute(ctx.path, "chat/send");
    if (ctx.method === "POST" && sendChatLobbyID) {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !credential(body) || !stringValue(body.text)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const text = stringValue(body.text) as string;
      const result = options.store.postLobbyChat({ lobbyID: sendChatLobbyID, lobbyCredentials: credential(body) as string, text });
      if (!result.ok) {
        setError(ctx, accessStatus(result.reason), result.reason);
        return;
      }
      ctx.body = { message: result.message };
      return;
    }

    const joinLobbyID = lobbyRoute(ctx.path, "join");
    if (ctx.method === "POST" && joinLobbyID) {
      const body = await readJSONBody(ctx);
      if (!isRecord(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const joined = options.store.joinLobby({
        lobbyID: joinLobbyID,
        displayName: stringValue(body.displayName),
        password: stringValue(body.password),
        privateDataFingerprint: stringValue(body.privateDataFingerprint) ?? "placeholder",
        seatID: stringValue(body.seatID),
        clientID: stringValue(body.clientID)
      });
      if (!joined.ok) {
        setError(ctx, accessStatus(joined.reason), joined.reason);
        return;
      }
      ctx.body = joined;
      return;
    }

    const updateLobbyID = lobbyRoute(ctx.path, "update-setup");
    if (ctx.method === "POST" && updateLobbyID) {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !credential(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const result = options.store.updateSetup({
        lobbyID: updateLobbyID,
        lobbyCredentials: credential(body) as string,
        roomName: stringValue(body.roomName),
        playerCount: playerCount(body.playerCount),
        setupData: setupData(body.setupData),
        privateDataFingerprint: stringValue(body.privateDataFingerprint),
        password: stringValue(body.password),
        spectatingAllowed: booleanValue(body.spectatingAllowed)
      });
      if (!result.ok) {
        setError(ctx, accessStatus(result.reason), result.reason);
        return;
      }
      ctx.body = { ok: true, lobby: options.store.getLobbyForCredentials(updateLobbyID, credential(body) as string) };
      return;
    }

    const selectLobbyID = lobbyRoute(ctx.path, "select-nation");
    if (ctx.method === "POST" && selectLobbyID) {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !credential(body) || typeof body.nationID !== "string") {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const result = options.store.selectNation({ lobbyID: selectLobbyID, lobbyCredentials: credential(body) as string, nationID: body.nationID });
      if (!result.ok) {
        setError(ctx, accessStatus(result.reason), result.reason);
        return;
      }
      ctx.body = { ok: true, lobby: options.store.getLobbyForCredentials(selectLobbyID, credential(body) as string) };
      return;
    }

    const readyLobbyID = lobbyRoute(ctx.path, "ready");
    if (ctx.method === "POST" && readyLobbyID) {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !credential(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const result = options.store.setReady({ lobbyID: readyLobbyID, lobbyCredentials: credential(body) as string, ready: booleanValue(body.ready) ?? true });
      if (!result.ok) {
        setError(ctx, accessStatus(result.reason), result.reason);
        return;
      }
      ctx.body = { ok: true, lobby: options.store.getLobbyForCredentials(readyLobbyID, credential(body) as string) };
      return;
    }

    const leaveLobbyID = lobbyRoute(ctx.path, "leave");
    if (ctx.method === "POST" && leaveLobbyID) {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !credential(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const result = options.store.leaveLobby({ lobbyID: leaveLobbyID, lobbyCredentials: credential(body) as string });
      if (!result.ok) {
        setError(ctx, accessStatus(result.reason), result.reason);
        return;
      }
      ctx.body = { ok: true };
      return;
    }

    const heartbeatLobbyID = lobbyRoute(ctx.path, "heartbeat");
    if (ctx.method === "POST" && heartbeatLobbyID) {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !credential(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const result = options.store.heartbeatLobby({ lobbyID: heartbeatLobbyID, lobbyCredentials: credential(body) as string });
      if (!result.ok) {
        setError(ctx, accessStatus(result.reason), result.reason);
        return;
      }
      ctx.body = { ok: true };
      return;
    }

    const spectateLobbyID = lobbyRoute(ctx.path, "spectate");
    if (ctx.method === "POST" && spectateLobbyID) {
      setError(ctx, 409, "spectation_unavailable");
      return;
    }

    const startLobbyID = lobbyRoute(ctx.path, "start");
    if (ctx.method === "POST" && startLobbyID) {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !credential(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const start = options.store.beginStarting(startLobbyID, credential(body) as string);
      if (!start.ok) {
        setError(ctx, accessStatus(start.reason), start.reason);
        return;
      }
      try {
        const finalSetup = finalizedSetup(start.setupData, start.seats);
        const created = await options.boardgameApi.createMatch({ numPlayers: start.seats.length, setupData: finalSetup });
        const playerCredentialsBySeat: Record<string, string> = {};
        for (const seat of start.seats) {
          const joined = await options.boardgameApi.joinMatch({ matchID: created.matchID, playerID: seat.seatID, playerName: seat.displayName });
          playerCredentialsBySeat[seat.seatID] = joined.playerCredentials;
        }
        options.matchStore?.createMatchMetadata({
          matchID: created.matchID,
          roomName: start.roomName,
          playerCount: start.seats.length,
          setupData: finalSetup,
          privateDataFingerprint: start.privateDataFingerprint,
          ...(start.passwordVerifier ? { passwordVerifier: start.passwordVerifier } : {}),
          spectatingAllowed: start.spectatingAllowed,
          status: "in_progress",
          occupiedSeats: start.seats.map((seat) => ({
            playerID: seat.seatID,
            playerName: seat.displayName,
            isConnected: true
          }))
        });
        const lobby = options.store.markStarted({ lobbyID: startLobbyID, matchID: created.matchID, playerCredentialsBySeat });
        ctx.body = {
          matchID: created.matchID,
          playerCredentials: lobby?.playerCredentials,
          playerID: lobby?.viewer.seatID,
          lobby
        };
      } catch {
        options.store.recoverStartFailure(startLobbyID);
        setError(ctx, 500, "start_failed");
      }
      return;
    }

    await next();
  };
}
