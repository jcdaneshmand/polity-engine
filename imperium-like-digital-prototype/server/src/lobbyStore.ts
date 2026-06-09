import { createHash } from "node:crypto";
import type { CreateLobbyMatchInput, ListedMatch, ListedMatchStatus, LobbyAccessResult, RecordPlayerJoinInput, RecordPlayerLeaveInput } from "./lobbyTypes";

type LobbyStoreOptions = {
  now?: () => string;
  hashPassword?: (value: string) => string;
  playerStaleMs?: number;
};

type PrivateMatchMetadata = {
  matchID: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  status: ListedMatchStatus;
  playerCount: number;
  occupiedSeats: Map<string, { playerID: string; playerName: string; isConnected: boolean; playerCredentials: string; clientID?: string; lastSeenAt: string }>;
  isLocked: boolean;
  spectatingAllowed: boolean;
  privateDataFingerprint: string;
  passwordVerifier?: string;
  setupSummary: ListedMatch["setupSummary"];
};

const PLACEHOLDER_FINGERPRINTS = new Set(["placeholder", "placeholder:v1"]);
const DEFAULT_PLAYER_STALE_MS = 15_000;

function defaultHashPassword(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeRoomName(roomName: string | undefined, matchID: string): string {
  const trimmed = roomName?.trim();
  return trimmed || `Game ${matchID}`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function deriveSetupSummary(setupData: unknown): ListedMatch["setupSummary"] {
  const setup = setupData && typeof setupData === "object" ? setupData as {
    options?: {
      commonsSetId?: unknown;
      enabledExpansions?: unknown;
      enabledVariants?: unknown;
    };
    playerNationIds?: unknown;
  } : {};
  const playerNationIds = setup.playerNationIds && typeof setup.playerNationIds === "object"
    ? Object.values(setup.playerNationIds as Record<string, unknown>).filter((value): value is string => typeof value === "string")
    : [];
  return {
    commonsSetId: typeof setup.options?.commonsSetId === "string" ? setup.options.commonsSetId : "classics",
    enabledExpansions: stringArray(setup.options?.enabledExpansions),
    enabledVariants: stringArray(setup.options?.enabledVariants),
    nationLabels: playerNationIds
  };
}

function availableSeats(match: PrivateMatchMetadata): string[] {
  return Array.from({ length: match.playerCount }, (_, index) => String(index)).filter((playerID) => !match.occupiedSeats.has(playerID));
}

function listedPriority(match: ListedMatch): number {
  if (match.status === "setup" && match.availableSeats.length > 0) return 0;
  if (match.status === "in_progress" && match.spectatingAllowed) return 1;
  if (match.status === "setup") return 2;
  if (match.status === "in_progress") return 3;
  return 4;
}

function toListedMatch(match: PrivateMatchMetadata): ListedMatch {
  return {
    matchID: match.matchID,
    roomName: match.roomName,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
    status: match.status,
    playerCount: match.playerCount,
    occupiedSeats: Array.from(match.occupiedSeats.values())
      .sort((a, b) => Number(a.playerID) - Number(b.playerID))
      .map((seat) => ({ playerID: seat.playerID, playerName: seat.playerName, isConnected: seat.isConnected })),
    availableSeats: availableSeats(match),
    isLocked: match.isLocked,
    spectatingAllowed: match.spectatingAllowed,
    privateDataLabel: PLACEHOLDER_FINGERPRINTS.has(match.privateDataFingerprint) ? "placeholder" : "private_data_required",
    setupSummary: match.setupSummary
  };
}

export function sortListedMatches(matches: ListedMatch[]): ListedMatch[] {
  return [...matches].sort((a, b) => {
    const priority = listedPriority(a) - listedPriority(b);
    if (priority !== 0) return priority;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function createLobbyStore(options: LobbyStoreOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const hashPassword = options.hashPassword ?? defaultHashPassword;
  const playerStaleMs = options.playerStaleMs ?? DEFAULT_PLAYER_STALE_MS;
  const matches = new Map<string, PrivateMatchMetadata>();

  function cleanupStalePlayers(match: PrivateMatchMetadata): void {
    const current = Date.parse(now());
    for (const seat of Array.from(match.occupiedSeats.values())) {
      if (current - Date.parse(seat.lastSeenAt) > playerStaleMs) {
        match.occupiedSeats.delete(seat.playerID);
        match.updatedAt = now();
      }
    }
  }

  return {
    createMatchMetadata(input: CreateLobbyMatchInput): ListedMatch {
      const timestamp = now();
      const password = input.password?.trim();
      const passwordVerifier = input.passwordVerifier ?? (password ? hashPassword(password) : undefined);
      const match: PrivateMatchMetadata = {
        matchID: input.matchID,
        roomName: safeRoomName(input.roomName, input.matchID),
        createdAt: timestamp,
        updatedAt: timestamp,
        status: input.status ?? "setup",
        playerCount: input.playerCount,
        occupiedSeats: new Map((input.occupiedSeats ?? []).map((seat) => [seat.playerID, { ...seat, playerCredentials: seat.playerCredentials ?? "", lastSeenAt: timestamp }])),
        isLocked: Boolean(passwordVerifier),
        spectatingAllowed: input.spectatingAllowed ?? true,
        privateDataFingerprint: input.privateDataFingerprint,
        ...(passwordVerifier ? { passwordVerifier } : {}),
        setupSummary: deriveSetupSummary(input.setupData)
      };
      matches.set(input.matchID, match);
      return toListedMatch(match);
    },

    listMatches(): ListedMatch[] {
      for (const match of matches.values()) cleanupStalePlayers(match);
      return sortListedMatches(Array.from(matches.values()).map(toListedMatch));
    },

    getMatch(matchID: string): ListedMatch | undefined {
      const match = matches.get(matchID);
      if (match) cleanupStalePlayers(match);
      return match ? toListedMatch(match) : undefined;
    },

    recordPlayerJoin(input: RecordPlayerJoinInput): ListedMatch | undefined {
      const match = matches.get(input.matchID);
      if (!match) return undefined;
      match.occupiedSeats.set(input.playerID, {
        playerID: input.playerID,
        playerName: input.playerName,
        isConnected: true,
        playerCredentials: input.playerCredentials,
        lastSeenAt: now(),
        ...(input.clientID ? { clientID: input.clientID } : {})
      });
      match.updatedAt = now();
      return toListedMatch(match);
    },

    findPlayerByClientID(matchID: string, clientID: string): { playerID: string } | undefined {
      const match = matches.get(matchID);
      if (!match) return undefined;
      const seat = Array.from(match.occupiedSeats.values()).find((candidate) => candidate.clientID === clientID);
      return seat ? { playerID: seat.playerID } : undefined;
    },

    validatePlayerCredentials(input: { matchID: string; playerID: string; playerCredentials: string }): LobbyAccessResult {
      const match = matches.get(input.matchID);
      if (!match) return { ok: false, reason: "match_not_found" };
      const seat = match.occupiedSeats.get(input.playerID);
      if (!seat) return { ok: false, reason: "seat_unavailable" };
      return seat.playerCredentials === input.playerCredentials ? { ok: true } : { ok: false, reason: "invalid_credentials" };
    },

    heartbeatPlayer(input: { matchID: string; playerID: string; playerCredentials: string; clientID?: string }): { ok: true } | { ok: false; reason: "match_not_found" | "seat_unavailable" | "duplicate_client" | "invalid_credentials" } {
      const match = matches.get(input.matchID);
      if (!match) return { ok: false, reason: "match_not_found" };
      const seat = match.occupiedSeats.get(input.playerID);
      if (!seat) return { ok: false, reason: "seat_unavailable" };
      if (seat.playerCredentials !== input.playerCredentials) return { ok: false, reason: "invalid_credentials" };
      if (input.clientID && seat.clientID && input.clientID !== seat.clientID) return { ok: false, reason: "duplicate_client" };
      seat.lastSeenAt = now();
      seat.isConnected = true;
      match.updatedAt = now();
      return { ok: true };
    },

    recordPlayerLeave(input: RecordPlayerLeaveInput): ListedMatch | undefined {
      const match = matches.get(input.matchID);
      if (!match) return undefined;
      const seat = match.occupiedSeats.get(input.playerID);
      if (!seat || seat.playerCredentials !== input.playerCredentials) return toListedMatch(match);
      match.occupiedSeats.delete(input.playerID);
      if (match.occupiedSeats.size === 0) {
        matches.delete(input.matchID);
        return undefined;
      }
      match.updatedAt = now();
      return toListedMatch(match);
    },

    clearMatches(): number {
      const count = matches.size;
      matches.clear();
      return count;
    },

    markMatchInProgress(matchID: string): ListedMatch | undefined {
      const match = matches.get(matchID);
      if (!match) return undefined;
      match.status = "in_progress";
      match.updatedAt = now();
      return toListedMatch(match);
    },

    closeMatch(input: { matchID: string; playerID: string; playerCredentials: string }): { ok: true } | { ok: false; reason: "match_not_found" | "not_host" | "invalid_credentials" } {
      const match = matches.get(input.matchID);
      if (!match) return { ok: false, reason: "match_not_found" };
      if (input.playerID !== "0") return { ok: false, reason: "not_host" };
      const seat = match.occupiedSeats.get(input.playerID);
      if (!seat || seat.playerCredentials !== input.playerCredentials) return { ok: false, reason: "invalid_credentials" };
      matches.delete(input.matchID);
      return { ok: true };
    },

    validateAccess(args: { matchID: string; password?: string; privateDataFingerprint: string }): LobbyAccessResult {
      const match = matches.get(args.matchID);
      if (!match) return { ok: false, reason: "match_not_found" };
      if (match.privateDataFingerprint !== args.privateDataFingerprint) return { ok: false, reason: "private_data_mismatch" };
      if (!match.isLocked) return { ok: true };
      const password = args.password?.trim();
      if (!password) return { ok: false, reason: "missing_password" };
      return hashPassword(password) === match.passwordVerifier ? { ok: true } : { ok: false, reason: "wrong_password" };
    }
  };
}

export type LobbyStore = ReturnType<typeof createLobbyStore>;
