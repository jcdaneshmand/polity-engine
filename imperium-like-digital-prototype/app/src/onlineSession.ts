export const ONLINE_SESSION_STORAGE_KEY = "polity-engine.onlineSession.v1";

export type OnlineStartedSessionRecord = {
  kind?: "player" | "spectator";
  matchID: string;
  playerID?: string;
  credentials: string;
  serverURL: string;
  numPlayers: number;
  savedAt: string;
};

export type OnlineLobbySessionRecord = {
  kind: "lobby";
  lobbyID: string;
  seatID: string;
  lobbyCredentials: string;
  serverURL: string;
  savedAt: string;
};

export type OnlineSessionRecord = OnlineStartedSessionRecord | OnlineLobbySessionRecord;

export type JoinURLDetails = {
  matchID?: string;
  serverURL?: string;
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const GAME_NAME = "polity-engine";
const PLACEHOLDER_FINGERPRINT = "placeholder";

export type PrivateDataLabel = "placeholder" | "private_data_required";

export type ChatMessage = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

export type ListedMatch = {
  matchID: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  status: "setup" | "in_progress" | "ended";
  playerCount: number;
  occupiedSeats: Array<{ playerID: string; playerName: string; isConnected: boolean }>;
  availableSeats: string[];
  isLocked: boolean;
  spectatingAllowed: boolean;
  privateDataLabel: PrivateDataLabel;
  setupSummary: {
    commonsSetId: string;
    enabledExpansions: string[];
    enabledVariants: string[];
    nationLabels: string[];
  };
};

export type ListedLobby = {
  kind: "lobby";
  lobbyID: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  status: "waiting" | "locked";
  playerCount: number;
  occupiedSeats: Array<{ seatID: string; displayName: string; connected: boolean; ready: boolean; selectedNationID?: string }>;
  availableSeats: string[];
  isLocked: boolean;
  privateDataLabel: PrivateDataLabel;
  setupSummary: ListedMatch["setupSummary"];
};

export type LobbySeatView = {
  seatID: string;
  displayName: string;
  connected: boolean;
  ready: boolean;
  isSelf: boolean;
  isHost: boolean;
  selectedNationID?: string;
};

export type LobbyRoomDetails = ListedLobby & {
  setupData: unknown;
  seats: LobbySeatView[];
  viewer: {
    seatID: string;
    isHost: boolean;
  };
  startedMatchID?: string;
  playerCredentials?: string;
};

function isOnlineSessionRecord(value: unknown): value is OnlineSessionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as OnlineSessionRecord;
  if (record.kind === "lobby") {
    return typeof record.lobbyID === "string" && record.lobbyID.length > 0
      && typeof record.seatID === "string" && record.seatID.length > 0
      && typeof record.lobbyCredentials === "string" && record.lobbyCredentials.length > 0
      && typeof record.serverURL === "string" && record.serverURL.length > 0
      && typeof record.savedAt === "string" && record.savedAt.length > 0;
  }
  const started = record as OnlineStartedSessionRecord;
  return typeof started.matchID === "string" && started.matchID.length > 0
    && (started.kind === "spectator" || typeof started.playerID === "string" && started.playerID.length > 0)
    && typeof started.credentials === "string" && started.credentials.length > 0
    && typeof started.serverURL === "string" && started.serverURL.length > 0
    && Number.isInteger(started.numPlayers) && started.numPlayers > 0
    && typeof started.savedAt === "string" && started.savedAt.length > 0;
}

export function serializeOnlineSessionRecord(record: OnlineSessionRecord): string {
  return JSON.stringify(record);
}

export function parseOnlineSessionRecord(text: string | null | undefined): OnlineSessionRecord | undefined {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    return isOnlineSessionRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function buildJoinURL(baseURL: string, matchID: string, serverURL: string): string {
  const url = new URL(baseURL);
  url.searchParams.set("matchID", matchID);
  url.searchParams.set("serverURL", serverURL);
  return url.toString();
}

export function parseJoinURL(url: string): JoinURLDetails {
  const parsed = new URL(url);
  return {
    matchID: parsed.searchParams.get("matchID") || undefined,
    serverURL: parsed.searchParams.get("serverURL") || undefined
  };
}

export function resolveMultiplayerServerURL(args: { configuredURL?: string; windowOrigin?: string }): string {
  const configured = args.configuredURL?.trim();
  if (configured) return configured;
  if (args.windowOrigin) return args.windowOrigin;
  return "http://localhost:8000";
}

function lobbyURL(serverURL: string, path: string): string {
  return `${serverURL.replace(/\/$/, "")}${path}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function computePrivateDataFingerprint(privateData: unknown): string {
  if (!privateData || typeof privateData !== "object" || !Object.keys(privateData).length) return PLACEHOLDER_FINGERPRINT;
  return `private:${fnv1a(JSON.stringify(canonicalize(privateData)))}`;
}

async function postLobbyJSON<T>(url: string, body: unknown, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Lobby request failed (${response.status})`);
  }
  return await parseLobbyJSON<T>(response);
}

async function getLobbyJSON<T>(url: string, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Lobby request failed (${response.status})`);
  }
  return await parseLobbyJSON<T>(response);
}

async function parseLobbyJSON<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Online lobby is not available from this app server.");
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error("Online lobby returned an invalid response.");
  }
}

export async function createOnlineMatch(args: { serverURL: string; numPlayers: number; setupData: unknown; fetcher?: Fetcher }): Promise<{ matchID: string }> {
  return postLobbyJSON<{ matchID: string }>(
    lobbyURL(args.serverURL, `/games/${GAME_NAME}/create`),
    { numPlayers: args.numPlayers, setupData: args.setupData },
    args.fetcher ?? fetch
  );
}

export async function joinOnlineMatch(args: { serverURL: string; matchID: string; playerID: string; playerName: string; fetcher?: Fetcher }): Promise<{ playerCredentials: string }> {
  return postLobbyJSON<{ playerCredentials: string }>(
    lobbyURL(args.serverURL, `/games/${GAME_NAME}/${args.matchID}/join`),
    { playerID: args.playerID, playerName: args.playerName },
    args.fetcher ?? fetch
  );
}

function listedPriority(match: ListedMatch): number {
  if (match.status === "setup" && match.availableSeats.length > 0) return 0;
  if (match.status === "in_progress" && match.spectatingAllowed) return 1;
  if (match.status === "setup") return 2;
  if (match.status === "in_progress") return 3;
  return 4;
}

export function sortListedMatches(matches: ListedMatch[]): ListedMatch[] {
  return [...matches].sort((left, right) => {
    const priority = listedPriority(left) - listedPriority(right);
    if (priority !== 0) return priority;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export async function listOnlineMatches(args: { serverURL: string; fetcher?: Fetcher }): Promise<ListedMatch[]> {
  const result = await getLobbyJSON<{ matches: ListedMatch[] }>(
    lobbyURL(args.serverURL, "/polity/lobby/matches"),
    args.fetcher ?? fetch
  );
  return sortListedMatches(result.matches);
}

export async function listLobbyRooms(args: { serverURL: string; fetcher?: Fetcher }): Promise<ListedLobby[]> {
  const result = await getLobbyJSON<{ lobbies: ListedLobby[] }>(
    lobbyURL(args.serverURL, "/polity/lobby/rooms"),
    args.fetcher ?? fetch
  );
  return result.lobbies;
}

export async function listOnlineChat(args: { serverURL: string; fetcher?: Fetcher }): Promise<ChatMessage[]> {
  const result = await getLobbyJSON<{ messages: ChatMessage[] }>(
    lobbyURL(args.serverURL, "/polity/lobby/chat"),
    args.fetcher ?? fetch
  );
  return result.messages;
}

export async function sendOnlineChat(args: { serverURL: string; author: string; text: string; fetcher?: Fetcher }): Promise<{ message: ChatMessage; messages?: ChatMessage[] }> {
  return postLobbyJSON<{ message: ChatMessage; messages?: ChatMessage[] }>(
    lobbyURL(args.serverURL, "/polity/lobby/chat"),
    { author: args.author, text: args.text },
    args.fetcher ?? fetch
  );
}

export async function listLobbyChat(args: { serverURL: string; lobbyID: string; lobbyCredentials: string; fetcher?: Fetcher }): Promise<ChatMessage[]> {
  const result = await postLobbyJSON<{ messages: ChatMessage[] }>(
    lobbyURL(args.serverURL, `/polity/lobby/rooms/${encodeURIComponent(args.lobbyID)}/chat`),
    { lobbyCredentials: args.lobbyCredentials },
    args.fetcher ?? fetch
  );
  return result.messages;
}

export async function sendLobbyChat(args: { serverURL: string; lobbyID: string; lobbyCredentials: string; text: string; fetcher?: Fetcher }): Promise<{ message: ChatMessage; messages?: ChatMessage[] }> {
  return postLobbyJSON<{ message: ChatMessage; messages?: ChatMessage[] }>(
    lobbyURL(args.serverURL, `/polity/lobby/rooms/${encodeURIComponent(args.lobbyID)}/chat/send`),
    { lobbyCredentials: args.lobbyCredentials, text: args.text },
    args.fetcher ?? fetch
  );
}

export async function createLobbyRoom(args: {
  serverURL: string;
  roomName: string;
  playerCount: number;
  setupData: unknown;
  privateDataFingerprint: string;
  password?: string;
  hostName?: string;
  clientID?: string;
  fetcher?: Fetcher;
}): Promise<{ lobbyID: string; seatID: string; lobbyCredentials: string; lobby: LobbyRoomDetails }> {
  return postLobbyJSON<{ lobbyID: string; seatID: string; lobbyCredentials: string; lobby: LobbyRoomDetails }>(
    lobbyURL(args.serverURL, "/polity/lobby/rooms"),
    {
      roomName: args.roomName,
      playerCount: args.playerCount,
      setupData: args.setupData,
      privateDataFingerprint: args.privateDataFingerprint,
      ...(args.password?.trim() ? { password: args.password.trim() } : {}),
      ...(args.hostName?.trim() ? { hostName: args.hostName.trim() } : {}),
      ...(args.clientID?.trim() ? { clientID: args.clientID.trim() } : {})
    },
    args.fetcher ?? fetch
  );
}

export async function joinLobbyRoom(args: {
  serverURL: string;
  lobbyID: string;
  displayName: string;
  privateDataFingerprint: string;
  password?: string;
  seatID?: string;
  clientID?: string;
  fetcher?: Fetcher;
}): Promise<{ lobbyID: string; seatID: string; lobbyCredentials: string; lobby: LobbyRoomDetails }> {
  return postLobbyJSON<{ lobbyID: string; seatID: string; lobbyCredentials: string; lobby: LobbyRoomDetails }>(
    lobbyURL(args.serverURL, `/polity/lobby/rooms/${encodeURIComponent(args.lobbyID)}/join`),
    {
      displayName: args.displayName,
      privateDataFingerprint: args.privateDataFingerprint,
      ...(args.password?.trim() ? { password: args.password.trim() } : {}),
      ...(args.seatID ? { seatID: args.seatID } : {}),
      ...(args.clientID?.trim() ? { clientID: args.clientID.trim() } : {})
    },
    args.fetcher ?? fetch
  );
}

export async function rejoinLobbyRoom(args: { serverURL: string; lobbyID: string; lobbyCredentials: string; fetcher?: Fetcher }): Promise<{ lobby: LobbyRoomDetails }> {
  return postLobbyJSON<{ lobby: LobbyRoomDetails }>(
    lobbyURL(args.serverURL, `/polity/lobby/rooms/${encodeURIComponent(args.lobbyID)}`),
    { lobbyCredentials: args.lobbyCredentials },
    args.fetcher ?? fetch
  );
}

export async function heartbeatLobbyRoom(args: { serverURL: string; lobbyID: string; lobbyCredentials: string; fetcher?: Fetcher }): Promise<{ ok: true }> {
  return postLobbyJSON<{ ok: true }>(
    lobbyURL(args.serverURL, `/polity/lobby/rooms/${encodeURIComponent(args.lobbyID)}/heartbeat`),
    { lobbyCredentials: args.lobbyCredentials },
    args.fetcher ?? fetch
  );
}

export async function leaveLobbyRoom(args: { serverURL: string; lobbyID: string; lobbyCredentials: string; fetcher?: Fetcher }): Promise<{ ok: true }> {
  return postLobbyJSON<{ ok: true }>(
    lobbyURL(args.serverURL, `/polity/lobby/rooms/${encodeURIComponent(args.lobbyID)}/leave`),
    { lobbyCredentials: args.lobbyCredentials },
    args.fetcher ?? fetch
  );
}

export async function clearAllOnlineGames(args: { serverURL: string; fetcher?: Fetcher }): Promise<{ ok: true; lobbiesCleared: number; matchesCleared: number }> {
  return postLobbyJSON<{ ok: true; lobbiesCleared: number; matchesCleared: number }>(
    lobbyURL(args.serverURL, "/polity/lobby/admin/clear"),
    {},
    args.fetcher ?? fetch
  );
}

export async function updateLobbySetup(args: {
  serverURL: string;
  lobbyID: string;
  lobbyCredentials: string;
  roomName: string;
  playerCount: number;
  setupData: unknown;
  privateDataFingerprint: string;
  password?: string;
  spectatingAllowed?: boolean;
  fetcher?: Fetcher;
}): Promise<{ ok: true; lobby?: LobbyRoomDetails }> {
  return postLobbyJSON<{ ok: true; lobby?: LobbyRoomDetails }>(
    lobbyURL(args.serverURL, `/polity/lobby/rooms/${encodeURIComponent(args.lobbyID)}/update-setup`),
    {
      lobbyCredentials: args.lobbyCredentials,
      roomName: args.roomName,
      playerCount: args.playerCount,
      setupData: args.setupData,
      privateDataFingerprint: args.privateDataFingerprint,
      ...(args.password !== undefined ? { password: args.password } : {}),
      ...(args.spectatingAllowed !== undefined ? { spectatingAllowed: args.spectatingAllowed } : {})
    },
    args.fetcher ?? fetch
  );
}

export async function selectLobbyNation(args: { serverURL: string; lobbyID: string; lobbyCredentials: string; nationID: string; fetcher?: Fetcher }): Promise<{ ok: true; lobby?: LobbyRoomDetails }> {
  return postLobbyJSON<{ ok: true; lobby?: LobbyRoomDetails }>(
    lobbyURL(args.serverURL, `/polity/lobby/rooms/${encodeURIComponent(args.lobbyID)}/select-nation`),
    { lobbyCredentials: args.lobbyCredentials, nationID: args.nationID },
    args.fetcher ?? fetch
  );
}

export async function setLobbyReady(args: { serverURL: string; lobbyID: string; lobbyCredentials: string; ready: boolean; fetcher?: Fetcher }): Promise<{ ok: true; lobby?: LobbyRoomDetails }> {
  return postLobbyJSON<{ ok: true; lobby?: LobbyRoomDetails }>(
    lobbyURL(args.serverURL, `/polity/lobby/rooms/${encodeURIComponent(args.lobbyID)}/ready`),
    { lobbyCredentials: args.lobbyCredentials, ready: args.ready },
    args.fetcher ?? fetch
  );
}

export async function startLobbyGame(args: { serverURL: string; lobbyID: string; lobbyCredentials: string; fetcher?: Fetcher }): Promise<{ matchID: string; playerID: string; playerCredentials: string; lobby?: LobbyRoomDetails }> {
  return postLobbyJSON<{ matchID: string; playerID: string; playerCredentials: string; lobby?: LobbyRoomDetails }>(
    lobbyURL(args.serverURL, `/polity/lobby/rooms/${encodeURIComponent(args.lobbyID)}/start`),
    { lobbyCredentials: args.lobbyCredentials },
    args.fetcher ?? fetch
  );
}

export async function createPolityOnlineMatch(args: {
  serverURL: string;
  roomName: string;
  numPlayers: number;
  setupData: unknown;
  privateDataFingerprint: string;
  password?: string;
  fetcher?: Fetcher;
}): Promise<{ matchID: string }> {
  return postLobbyJSON<{ matchID: string }>(
    lobbyURL(args.serverURL, "/polity/lobby/matches"),
    {
      roomName: args.roomName,
      numPlayers: args.numPlayers,
      setupData: args.setupData,
      privateDataFingerprint: args.privateDataFingerprint,
      ...(args.password?.trim() ? { password: args.password.trim() } : {})
    },
    args.fetcher ?? fetch
  );
}

export async function joinPolityOnlineMatch(args: {
  serverURL: string;
  matchID: string;
  playerID?: string;
  playerName: string;
  privateDataFingerprint: string;
  password?: string;
  clientID?: string;
  fetcher?: Fetcher;
}): Promise<{ playerCredentials: string; playerID: string; match?: ListedMatch }> {
  return postLobbyJSON<{ playerCredentials: string; playerID: string; match?: ListedMatch }>(
    lobbyURL(args.serverURL, `/polity/lobby/matches/${encodeURIComponent(args.matchID)}/join`),
    {
      playerName: args.playerName,
      privateDataFingerprint: args.privateDataFingerprint,
      ...(args.playerID ? { playerID: args.playerID } : {}),
      ...(args.password?.trim() ? { password: args.password.trim() } : {}),
      ...(args.clientID?.trim() ? { clientID: args.clientID.trim() } : {})
    },
    args.fetcher ?? fetch
  );
}

export async function leavePolityOnlineMatch(args: {
  serverURL: string;
  matchID: string;
  playerID: string;
  fetcher?: Fetcher;
}): Promise<{ ok: true; match?: ListedMatch }> {
  return postLobbyJSON<{ ok: true; match?: ListedMatch }>(
    lobbyURL(args.serverURL, `/polity/lobby/matches/${encodeURIComponent(args.matchID)}/leave`),
    { playerID: args.playerID },
    args.fetcher ?? fetch
  );
}

export async function closePolityOnlineMatch(args: {
  serverURL: string;
  matchID: string;
  playerID: string;
  fetcher?: Fetcher;
}): Promise<{ ok: true }> {
  return postLobbyJSON<{ ok: true }>(
    lobbyURL(args.serverURL, `/polity/lobby/matches/${encodeURIComponent(args.matchID)}/close`),
    { playerID: args.playerID },
    args.fetcher ?? fetch
  );
}

export async function heartbeatPolityOnlineMatch(args: {
  serverURL: string;
  matchID: string;
  playerID: string;
  clientID?: string;
  fetcher?: Fetcher;
}): Promise<{ ok: true }> {
  return postLobbyJSON<{ ok: true }>(
    lobbyURL(args.serverURL, `/polity/lobby/matches/${encodeURIComponent(args.matchID)}/heartbeat`),
    {
      playerID: args.playerID,
      ...(args.clientID?.trim() ? { clientID: args.clientID.trim() } : {})
    },
    args.fetcher ?? fetch
  );
}

export async function spectateOnlineMatch(args: {
  serverURL: string;
  matchID: string;
  privateDataFingerprint: string;
  password?: string;
  fetcher?: Fetcher;
}): Promise<{ spectatorCredentials: string; match?: ListedMatch }> {
  return postLobbyJSON<{ spectatorCredentials: string; match?: ListedMatch }>(
    lobbyURL(args.serverURL, `/polity/lobby/matches/${encodeURIComponent(args.matchID)}/spectate`),
    {
      privateDataFingerprint: args.privateDataFingerprint,
      ...(args.password?.trim() ? { password: args.password.trim() } : {})
    },
    args.fetcher ?? fetch
  );
}
