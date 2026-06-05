import { createHash } from "node:crypto";
import type { CreateLobbyMatchInput, ListedMatch, ListedMatchStatus, LobbyAccessResult, RecordPlayerJoinInput } from "./lobbyTypes";

type LobbyStoreOptions = {
  now?: () => string;
  hashPassword?: (value: string) => string;
};

type PrivateMatchMetadata = {
  matchID: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  status: ListedMatchStatus;
  playerCount: number;
  occupiedSeats: Map<string, { playerID: string; playerName: string; isConnected: boolean }>;
  isLocked: boolean;
  spectatingAllowed: boolean;
  privateDataFingerprint: string;
  passwordVerifier?: string;
  setupSummary: ListedMatch["setupSummary"];
};

const PLACEHOLDER_FINGERPRINTS = new Set(["placeholder", "placeholder:v1"]);

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
    occupiedSeats: Array.from(match.occupiedSeats.values()).sort((a, b) => Number(a.playerID) - Number(b.playerID)),
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
  const matches = new Map<string, PrivateMatchMetadata>();

  return {
    createMatchMetadata(input: CreateLobbyMatchInput): ListedMatch {
      const timestamp = now();
      const password = input.password?.trim();
      const match: PrivateMatchMetadata = {
        matchID: input.matchID,
        roomName: safeRoomName(input.roomName, input.matchID),
        createdAt: timestamp,
        updatedAt: timestamp,
        status: "setup",
        playerCount: input.playerCount,
        occupiedSeats: new Map(),
        isLocked: Boolean(password),
        spectatingAllowed: true,
        privateDataFingerprint: input.privateDataFingerprint,
        ...(password ? { passwordVerifier: hashPassword(password) } : {}),
        setupSummary: deriveSetupSummary(input.setupData)
      };
      matches.set(input.matchID, match);
      return toListedMatch(match);
    },

    listMatches(): ListedMatch[] {
      return sortListedMatches(Array.from(matches.values()).map(toListedMatch));
    },

    getMatch(matchID: string): ListedMatch | undefined {
      const match = matches.get(matchID);
      return match ? toListedMatch(match) : undefined;
    },

    recordPlayerJoin(input: RecordPlayerJoinInput): ListedMatch | undefined {
      const match = matches.get(input.matchID);
      if (!match) return undefined;
      match.occupiedSeats.set(input.playerID, {
        playerID: input.playerID,
        playerName: input.playerName,
        isConnected: true
      });
      match.updatedAt = now();
      return toListedMatch(match);
    },

    markMatchInProgress(matchID: string): ListedMatch | undefined {
      const match = matches.get(matchID);
      if (!match) return undefined;
      match.status = "in_progress";
      match.updatedAt = now();
      return toListedMatch(match);
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
