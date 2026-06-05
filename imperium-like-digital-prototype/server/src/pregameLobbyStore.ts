import { createHash, randomUUID } from "node:crypto";
import type {
  ChatMessage,
  CreatePregameLobbyInput,
  JoinPregameLobbyInput,
  ListedLobby,
  LobbyAccessResult,
  LobbyRoomView,
  LobbySeatView,
  LobbySetupData,
  PregameLobbyStatus,
  PregameLobbyStoreOptions
} from "./pregameLobbyTypes";

type PrivateSeat = {
  seatID: string;
  clientID?: string;
  displayName?: string;
  lobbyCredentials?: string;
  connected: boolean;
  ready: boolean;
  lastSeenAt?: string;
  selectedNationID?: string;
  playerCredentials?: string;
};

type PrivateLobby = {
  lobbyID: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  emptySince?: string;
  status: PregameLobbyStatus;
  hostClientID: string;
  isLocked: boolean;
  passwordVerifier?: string;
  privateDataFingerprint: string;
  setupData: LobbySetupData;
  seats: PrivateSeat[];
  startedMatchID?: string;
  spectatingAllowed: boolean;
};

const PLACEHOLDER_FINGERPRINTS = new Set(["placeholder", "placeholder:v1"]);
const DEFAULT_CLEANUP_GRACE_MS = 10 * 60 * 1000;
const DEFAULT_PLAYER_STALE_MS = 15_000;
const LOUNGE_CHAT_KEY = "lounge";
const MAX_CHAT_MESSAGES = 50;
const MAX_CHAT_AUTHOR_LENGTH = 40;
const MAX_CHAT_TEXT_LENGTH = 240;

function defaultHashPassword(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function playerCount(value: number): number {
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : 2;
}

function roomName(value: string | undefined, fallback: string): string {
  return value?.trim() || `Lobby ${fallback}`;
}

function setupSummary(setupData: LobbySetupData): ListedLobby["setupSummary"] {
  return {
    commonsSetId: typeof setupData.options?.commonsSetId === "string" ? setupData.options.commonsSetId : "classics",
    enabledExpansions: stringArray(setupData.options?.enabledExpansions),
    enabledVariants: stringArray(setupData.options?.enabledVariants),
    nationLabels: Object.values(setupData.playerNationIds ?? {})
  };
}

function availableSeats(lobby: PrivateLobby): string[] {
  return lobby.seats.filter((seat) => !seat.lobbyCredentials).map((seat) => seat.seatID);
}

function occupiedSeats(lobby: PrivateLobby): PrivateSeat[] {
  return lobby.seats.filter((seat) => seat.lobbyCredentials);
}

function publicStatus(lobby: PrivateLobby): ListedLobby["status"] {
  return lobby.status === "locked" ? "locked" : "waiting";
}

function toListedLobby(lobby: PrivateLobby): ListedLobby {
  return {
    kind: "lobby",
    lobbyID: lobby.lobbyID,
    roomName: lobby.roomName,
    createdAt: lobby.createdAt,
    updatedAt: lobby.updatedAt,
    status: publicStatus(lobby),
    playerCount: lobby.seats.length,
    occupiedSeats: occupiedSeats(lobby).map((seat) => ({
      seatID: seat.seatID,
      displayName: seat.displayName ?? `Player ${Number(seat.seatID) + 1}`,
      connected: seat.connected,
      ready: seat.ready,
      ...(seat.selectedNationID ? { selectedNationID: seat.selectedNationID } : {})
    })),
    availableSeats: availableSeats(lobby),
    isLocked: lobby.isLocked,
    privateDataLabel: PLACEHOLDER_FINGERPRINTS.has(lobby.privateDataFingerprint) ? "placeholder" : "private_data_required",
    setupSummary: setupSummary(lobby.setupData)
  };
}

function findSeatByCredentials(lobby: PrivateLobby, lobbyCredentials: string): PrivateSeat | undefined {
  return lobby.seats.find((seat) => seat.lobbyCredentials === lobbyCredentials);
}

function trimChatValue(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function allOccupiedSeatsReady(lobby: PrivateLobby): boolean {
  const occupied = occupiedSeats(lobby);
  return occupied.length === lobby.seats.length && occupied.every((seat) => seat.ready && seat.selectedNationID);
}

function reconcileLock(lobby: PrivateLobby, timestamp: string): void {
  lobby.status = allOccupiedSeatsReady(lobby) ? "locked" : "waiting";
  lobby.updatedAt = timestamp;
}

function lobbyView(lobby: PrivateLobby, viewerSeat: PrivateSeat): LobbyRoomView {
  const listed = toListedLobby(lobby);
  const seats: LobbySeatView[] = lobby.seats.map((seat) => ({
    seatID: seat.seatID,
    displayName: seat.displayName ?? `Seat ${Number(seat.seatID) + 1}`,
    connected: seat.connected,
    ready: seat.ready,
    isSelf: seat.seatID === viewerSeat.seatID,
    isHost: seat.clientID === lobby.hostClientID,
    ...(seat.selectedNationID ? { selectedNationID: seat.selectedNationID } : {})
  }));
  return {
    ...listed,
    setupData: lobby.setupData,
    seats,
    viewer: {
      seatID: viewerSeat.seatID,
      isHost: viewerSeat.clientID === lobby.hostClientID
    },
    ...(lobby.startedMatchID ? { startedMatchID: lobby.startedMatchID } : {}),
    ...(viewerSeat.playerCredentials ? { playerCredentials: viewerSeat.playerCredentials } : {})
  };
}

export function createPregameLobbyStore(options: PregameLobbyStoreOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const createID = options.createID ?? (() => randomUUID());
  const createCredential = options.createCredential ?? (() => randomUUID());
  const hashPassword = options.hashPassword ?? defaultHashPassword;
  const cleanupGraceMs = options.cleanupGraceMs ?? DEFAULT_CLEANUP_GRACE_MS;
  const playerStaleMs = options.playerStaleMs ?? DEFAULT_PLAYER_STALE_MS;
  const lobbies = new Map<string, PrivateLobby>();
  const chatMessages = new Map<string, ChatMessage[]>();
  let nextChatID = 0;

  function timestamp(): string {
    return now();
  }

  function ensureSeatCount(count: number): PrivateSeat[] {
    return Array.from({ length: playerCount(count) }, (_, index) => ({
      seatID: String(index),
      connected: false,
      ready: false
    }));
  }

  function clearReady(lobby: PrivateLobby): void {
    for (const seat of lobby.seats) seat.ready = false;
    if (lobby.status === "locked") lobby.status = "waiting";
  }

  function clearSeat(seat: PrivateSeat): void {
    delete seat.clientID;
    delete seat.displayName;
    delete seat.lobbyCredentials;
    delete seat.lastSeenAt;
    delete seat.selectedNationID;
    delete seat.playerCredentials;
    seat.connected = false;
    seat.ready = false;
  }

  function cleanupStaleSeats(lobby: PrivateLobby): void {
    if (lobby.status === "started" || lobby.status === "starting") return;
    const current = Date.parse(timestamp());
    let changed = false;
    for (const seat of occupiedSeats(lobby)) {
      const lastSeenAt = seat.lastSeenAt ?? lobby.updatedAt;
      if (current - Date.parse(lastSeenAt) > playerStaleMs) {
        clearSeat(seat);
        changed = true;
      }
    }
    if (!changed) return;
    if (occupiedSeats(lobby).length === 0) lobby.emptySince = timestamp();
    reconcileLock(lobby, timestamp());
  }

  function appendChat(scope: string, author: string, text: string): { ok: true; message: ChatMessage } | { ok: false; reason: "invalid_chat" } {
    const cleanAuthor = trimChatValue(author, MAX_CHAT_AUTHOR_LENGTH) || "Player";
    const cleanText = trimChatValue(text, MAX_CHAT_TEXT_LENGTH);
    if (!cleanText) return { ok: false, reason: "invalid_chat" };
    const message: ChatMessage = {
      id: `chat-${nextChatID += 1}`,
      author: cleanAuthor,
      text: cleanText,
      createdAt: timestamp()
    };
    const current = [...(chatMessages.get(scope) ?? []), message].slice(-MAX_CHAT_MESSAGES);
    chatMessages.set(scope, current);
    return { ok: true, message };
  }

  function lobbyChatScope(lobbyID: string): string {
    return `lobby:${lobbyID}`;
  }

  return {
    listLoungeChat(): ChatMessage[] {
      return [...(chatMessages.get(LOUNGE_CHAT_KEY) ?? [])];
    },

    postLoungeChat(input: { author: string; text: string }) {
      return appendChat(LOUNGE_CHAT_KEY, input.author, input.text);
    },

    listLobbyChat(input: { lobbyID: string; lobbyCredentials: string }): { ok: true; messages: ChatMessage[] } | { ok: false; reason: "lobby_not_found" | "invalid_credentials" } {
      const lobby = lobbies.get(input.lobbyID);
      if (!lobby) return { ok: false, reason: "lobby_not_found" };
      const seat = findSeatByCredentials(lobby, input.lobbyCredentials);
      if (!seat) return { ok: false, reason: "invalid_credentials" };
      return { ok: true, messages: [...(chatMessages.get(lobbyChatScope(input.lobbyID)) ?? [])] };
    },

    postLobbyChat(input: { lobbyID: string; lobbyCredentials: string; text: string }) {
      const lobby = lobbies.get(input.lobbyID);
      if (!lobby) return { ok: false as const, reason: "lobby_not_found" as const };
      const seat = findSeatByCredentials(lobby, input.lobbyCredentials);
      if (!seat) return { ok: false as const, reason: "invalid_credentials" as const };
      return appendChat(lobbyChatScope(input.lobbyID), seat.displayName ?? `Player ${Number(seat.seatID) + 1}`, input.text);
    },

    createLobby(input: CreatePregameLobbyInput) {
      const ts = timestamp();
      const lobbyID = createID();
      const hostClientID = input.clientID?.trim() || createID();
      const lobbyCredentials = createCredential();
      const count = playerCount(input.playerCount);
      const seats = ensureSeatCount(count);
      seats[0] = {
        ...seats[0],
        clientID: hostClientID,
        displayName: input.hostName?.trim() || "Host",
        lobbyCredentials,
        connected: true,
        lastSeenAt: ts
      };
      const password = input.password?.trim();
      const lobby: PrivateLobby = {
        lobbyID,
        roomName: roomName(input.roomName, lobbyID),
        createdAt: ts,
        updatedAt: ts,
        status: "waiting",
        hostClientID,
        isLocked: Boolean(password),
        ...(password ? { passwordVerifier: hashPassword(password) } : {}),
        privateDataFingerprint: input.privateDataFingerprint,
        setupData: input.setupData,
        seats,
        spectatingAllowed: true
      };
      lobbies.set(lobbyID, lobby);
      return { lobbyID, seatID: "0", lobbyCredentials, lobby: lobbyView(lobby, seats[0]) };
    },

    listLobbies(): ListedLobby[] {
      for (const lobby of lobbies.values()) cleanupStaleSeats(lobby);
      this.cleanupEmptyLobbies();
      return Array.from(lobbies.values())
        .filter((lobby) => lobby.status === "waiting" || lobby.status === "locked")
        .map(toListedLobby)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    joinLobby(input: JoinPregameLobbyInput) {
      const lobby = lobbies.get(input.lobbyID);
      if (!lobby) return { ok: false as const, reason: "lobby_not_found" as const };
      if (lobby.status === "started" || lobby.status === "starting") return { ok: false as const, reason: "lobby_already_started" as const };
      cleanupStaleSeats(lobby);
      if (lobby.privateDataFingerprint !== input.privateDataFingerprint) return { ok: false as const, reason: "private_data_mismatch" as const };
      if (lobby.isLocked) {
        const password = input.password?.trim();
        if (!password) return { ok: false as const, reason: "missing_password" as const };
        if (hashPassword(password) !== lobby.passwordVerifier) return { ok: false as const, reason: "wrong_password" as const };
      }
      const clientID = input.clientID?.trim();
      if (clientID && occupiedSeats(lobby).some((candidate) => candidate.clientID === clientID)) {
        return { ok: false as const, reason: "duplicate_client" as const };
      }
      const seat = input.seatID
        ? lobby.seats.find((candidate) => candidate.seatID === input.seatID && !candidate.lobbyCredentials)
        : lobby.seats.find((candidate) => !candidate.lobbyCredentials);
      if (!seat) return { ok: false as const, reason: "seat_unavailable" as const };
      seat.clientID = clientID || createID();
      seat.displayName = input.displayName?.trim() || `Player ${Number(seat.seatID) + 1}`;
      seat.lobbyCredentials = createCredential();
      seat.connected = true;
      seat.lastSeenAt = timestamp();
      seat.ready = false;
      delete lobby.emptySince;
      lobby.updatedAt = timestamp();
      return { ok: true as const, lobbyID: lobby.lobbyID, seatID: seat.seatID, lobbyCredentials: seat.lobbyCredentials, lobby: lobbyView(lobby, seat) };
    },

    getLobbyForCredentials(lobbyID: string, lobbyCredentials: string): LobbyRoomView | undefined {
      const lobby = lobbies.get(lobbyID);
      if (!lobby) return undefined;
      const seat = findSeatByCredentials(lobby, lobbyCredentials);
      if (!seat) return undefined;
      seat.connected = true;
      seat.lastSeenAt = timestamp();
      delete lobby.emptySince;
      return lobbyView(lobby, seat);
    },

    heartbeatLobby(input: { lobbyID: string; lobbyCredentials: string }): LobbyAccessResult {
      const lobby = lobbies.get(input.lobbyID);
      if (!lobby) return { ok: false, reason: "lobby_not_found" };
      const seat = findSeatByCredentials(lobby, input.lobbyCredentials);
      if (!seat) return { ok: false, reason: "invalid_credentials" };
      seat.connected = true;
      seat.lastSeenAt = timestamp();
      delete lobby.emptySince;
      lobby.updatedAt = timestamp();
      return { ok: true };
    },

    updateSetup(input: { lobbyID: string; lobbyCredentials: string; setupData: LobbySetupData; playerCount: number; roomName?: string; privateDataFingerprint?: string; password?: string; spectatingAllowed?: boolean }): LobbyAccessResult {
      const lobby = lobbies.get(input.lobbyID);
      if (!lobby) return { ok: false, reason: "lobby_not_found" };
      const seat = findSeatByCredentials(lobby, input.lobbyCredentials);
      if (!seat) return { ok: false, reason: "invalid_credentials" };
      if (seat.clientID !== lobby.hostClientID) return { ok: false, reason: "not_host" };
      if (lobby.status === "started" || lobby.status === "starting") return { ok: false, reason: "lobby_already_started" };
      const nextCount = playerCount(input.playerCount);
      const occupiedBeyondCount = lobby.seats.some((candidate) => Number(candidate.seatID) >= nextCount && candidate.lobbyCredentials);
      if (occupiedBeyondCount) return { ok: false, reason: "invalid_setup" };
      lobby.seats = Array.from({ length: nextCount }, (_, index) => lobby.seats[index] ?? { seatID: String(index), connected: false, ready: false });
      lobby.setupData = input.setupData;
      lobby.roomName = roomName(input.roomName ?? lobby.roomName, lobby.lobbyID);
      if (input.privateDataFingerprint) lobby.privateDataFingerprint = input.privateDataFingerprint;
      if (input.password !== undefined) {
        const password = input.password.trim();
        lobby.isLocked = Boolean(password);
        if (password) lobby.passwordVerifier = hashPassword(password);
        else delete lobby.passwordVerifier;
      }
      if (input.spectatingAllowed !== undefined) lobby.spectatingAllowed = input.spectatingAllowed;
      clearReady(lobby);
      lobby.updatedAt = timestamp();
      return { ok: true };
    },

    selectNation(input: { lobbyID: string; lobbyCredentials: string; nationID: string }): LobbyAccessResult {
      const lobby = lobbies.get(input.lobbyID);
      if (!lobby) return { ok: false, reason: "lobby_not_found" };
      const seat = findSeatByCredentials(lobby, input.lobbyCredentials);
      if (!seat) return { ok: false, reason: "invalid_credentials" };
      if (!input.nationID.trim()) return { ok: false, reason: "invalid_nation" };
      seat.selectedNationID = input.nationID.trim();
      seat.ready = false;
      reconcileLock(lobby, timestamp());
      return { ok: true };
    },

    setReady(input: { lobbyID: string; lobbyCredentials: string; ready: boolean }): LobbyAccessResult {
      const lobby = lobbies.get(input.lobbyID);
      if (!lobby) return { ok: false, reason: "lobby_not_found" };
      const seat = findSeatByCredentials(lobby, input.lobbyCredentials);
      if (!seat) return { ok: false, reason: "invalid_credentials" };
      if (!seat.selectedNationID) return { ok: false, reason: "invalid_nation" };
      seat.ready = input.ready;
      reconcileLock(lobby, timestamp());
      return { ok: true };
    },

    leaveLobby(input: { lobbyID: string; lobbyCredentials: string }): LobbyAccessResult {
      const lobby = lobbies.get(input.lobbyID);
      if (!lobby) return { ok: false, reason: "lobby_not_found" };
      const seat = findSeatByCredentials(lobby, input.lobbyCredentials);
      if (!seat) return { ok: false, reason: "invalid_credentials" };
      clearSeat(seat);
      if (occupiedSeats(lobby).length === 0) lobby.emptySince = timestamp();
      lobby.updatedAt = timestamp();
      return { ok: true };
    },

    clearLobbies(): number {
      const lobbyIDs = Array.from(lobbies.keys());
      for (const lobbyID of lobbyIDs) chatMessages.delete(lobbyChatScope(lobbyID));
      lobbies.clear();
      return lobbyIDs.length;
    },

    beginStarting(lobbyID: string, lobbyCredentials: string): { ok: true; roomName: string; setupData: LobbySetupData; privateDataFingerprint: string; passwordVerifier?: string; spectatingAllowed: boolean; seats: Array<{ seatID: string; displayName: string; selectedNationID: string }> } | { ok: false; reason: string } {
      const lobby = lobbies.get(lobbyID);
      if (!lobby) return { ok: false, reason: "lobby_not_found" };
      const seat = findSeatByCredentials(lobby, lobbyCredentials);
      if (!seat) return { ok: false, reason: "invalid_credentials" };
      if (seat.clientID !== lobby.hostClientID) return { ok: false, reason: "not_host" };
      if (lobby.status !== "locked") return { ok: false, reason: "not_ready" };
      lobby.status = "starting";
      lobby.updatedAt = timestamp();
      return {
        ok: true,
        roomName: lobby.roomName,
        setupData: lobby.setupData,
        privateDataFingerprint: lobby.privateDataFingerprint,
        ...(lobby.passwordVerifier ? { passwordVerifier: lobby.passwordVerifier } : {}),
        spectatingAllowed: lobby.spectatingAllowed,
        seats: occupiedSeats(lobby).map((candidate) => ({
          seatID: candidate.seatID,
          displayName: candidate.displayName ?? `Player ${Number(candidate.seatID) + 1}`,
          selectedNationID: candidate.selectedNationID as string
        }))
      };
    },

    markStarted(input: { lobbyID: string; matchID: string; playerCredentialsBySeat: Record<string, string> }): LobbyRoomView | undefined {
      const lobby = lobbies.get(input.lobbyID);
      if (!lobby) return undefined;
      lobby.status = "started";
      lobby.startedMatchID = input.matchID;
      for (const seat of lobby.seats) {
        if (input.playerCredentialsBySeat[seat.seatID]) seat.playerCredentials = input.playerCredentialsBySeat[seat.seatID];
      }
      lobby.updatedAt = timestamp();
      const host = lobby.seats.find((seat) => seat.clientID === lobby.hostClientID) ?? lobby.seats[0];
      return lobbyView(lobby, host);
    },

    recoverStartFailure(lobbyID: string): void {
      const lobby = lobbies.get(lobbyID);
      if (!lobby || lobby.status !== "starting") return;
      clearReady(lobby);
      lobby.status = "waiting";
      lobby.updatedAt = timestamp();
    },

    getStartedMatch(lobbyID: string): { matchID: string } | undefined {
      const lobby = lobbies.get(lobbyID);
      return lobby?.startedMatchID ? { matchID: lobby.startedMatchID } : undefined;
    },

    cleanupEmptyLobbies(): string[] {
      const ts = timestamp();
      const current = Date.parse(ts);
      const removed: string[] = [];
      for (const lobby of lobbies.values()) {
        if (lobby.status === "started" || lobby.status === "starting") continue;
        if (occupiedSeats(lobby).length > 0) {
          delete lobby.emptySince;
          continue;
        }
        lobby.emptySince ??= ts;
        if (current - Date.parse(lobby.emptySince) > cleanupGraceMs) {
          lobby.status = "abandoned";
          removed.push(lobby.lobbyID);
        }
      }
      for (const lobbyID of removed) lobbies.delete(lobbyID);
      return removed;
    }
  };
}

export type PregameLobbyStore = ReturnType<typeof createPregameLobbyStore>;
