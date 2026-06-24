import type { ListedMatch } from "./lobbyTypes";

export type PregameLobbyStatus = "waiting" | "locked" | "starting" | "started" | "abandoned";
export type PrivateDataLabel = "placeholder" | "private_data_required";

export type ChatMessage = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};

export type LobbySetupData = {
  options?: {
    playerCount?: number;
    commonsSetId?: unknown;
    enabledExpansions?: unknown;
    enabledVariants?: unknown;
  };
  playerNationIds?: Record<string, string>;
  privateData?: unknown;
};

export type ListedLobbySeat = {
  seatID: string;
  displayName: string;
  connected: boolean;
  ready: boolean;
  selectedNationID?: string;
};

export type ListedLobby = {
  kind: "lobby";
  lobbyID: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  status: "waiting" | "locked";
  playerCount: number;
  occupiedSeats: ListedLobbySeat[];
  availableSeats: string[];
  isLocked: boolean;
  privateDataLabel: PrivateDataLabel;
  setupSummary: ListedMatch["setupSummary"];
};

export type LobbySeatView = ListedLobbySeat & {
  isSelf: boolean;
  isHost: boolean;
};

export type LobbyRoomView = ListedLobby & {
  setupData: LobbySetupData;
  seats: LobbySeatView[];
  viewer: {
    seatID: string;
    isHost: boolean;
  };
  startedMatchID?: string;
  playerCredentials?: string;
};

export type CreatePregameLobbyInput = {
  roomName?: string;
  playerCount: number;
  setupData: LobbySetupData;
  privateDataFingerprint: string;
  password?: string;
  hostName?: string;
  clientID?: string;
};

export type JoinPregameLobbyInput = {
  lobbyID: string;
  displayName?: string;
  password?: string;
  privateDataFingerprint: string;
  seatID?: string;
  clientID?: string;
};

export type LobbyAccessFailureReason =
  | "lobby_not_found"
  | "wrong_password"
  | "missing_password"
  | "private_data_mismatch"
  | "seat_unavailable"
  | "duplicate_client"
  | "lobby_already_started"
  | "invalid_credentials"
  | "not_host"
  | "not_ready"
  | "invalid_setup"
  | "invalid_nation"
  | "invalid_chat"
  | "spectation_unavailable";

export type LobbyAccessResult = { ok: true } | { ok: false; reason: LobbyAccessFailureReason };

export type PregameLobbyStoreOptions = {
  now?: () => string;
  createID?: () => string;
  createCredential?: () => string;
  hashPassword?: (value: string) => string;
  cleanupGraceMs?: number;
  playerStaleMs?: number;
  storageFile?: string;
};
