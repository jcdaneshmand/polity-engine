export const ONLINE_SESSION_STORAGE_KEY = "polity-engine.onlineSession.v1";

export type OnlineSessionRecord = {
  matchID: string;
  playerID: string;
  credentials: string;
  serverURL: string;
  numPlayers: number;
  savedAt: string;
};

export type JoinURLDetails = {
  matchID?: string;
  serverURL?: string;
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const GAME_NAME = "polity-engine";

function isOnlineSessionRecord(value: unknown): value is OnlineSessionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as OnlineSessionRecord;
  return typeof record.matchID === "string" && record.matchID.length > 0
    && typeof record.playerID === "string" && record.playerID.length > 0
    && typeof record.credentials === "string" && record.credentials.length > 0
    && typeof record.serverURL === "string" && record.serverURL.length > 0
    && Number.isInteger(record.numPlayers) && record.numPlayers > 0
    && typeof record.savedAt === "string" && record.savedAt.length > 0;
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
  return args.configuredURL?.trim() || args.windowOrigin || "http://localhost:8000";
}

function lobbyURL(serverURL: string, path: string): string {
  return `${serverURL.replace(/\/$/, "")}${path}`;
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
  return await response.json() as T;
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
