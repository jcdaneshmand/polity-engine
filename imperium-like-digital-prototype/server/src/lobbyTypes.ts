export type PrivateDataLabel = "placeholder" | "private_data_required";

export type ListedMatchStatus = "setup" | "in_progress" | "ended";

export type ListedSeat = {
  playerID: string;
  playerName: string;
  isConnected: boolean;
};

export type ListedMatch = {
  matchID: string;
  roomName: string;
  createdAt: string;
  updatedAt: string;
  status: ListedMatchStatus;
  playerCount: number;
  occupiedSeats: ListedSeat[];
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

export type LobbyAccessFailureReason =
  | "match_not_found"
  | "missing_password"
  | "wrong_password"
  | "private_data_mismatch"
  | "match_not_joinable"
  | "match_full"
  | "seat_unavailable";

export type LobbyAccessResult = { ok: true } | { ok: false; reason: LobbyAccessFailureReason };

export type CreateLobbyMatchInput = {
  matchID: string;
  roomName?: string;
  playerCount: number;
  setupData: unknown;
  privateDataFingerprint: string;
  password?: string;
  passwordVerifier?: string;
  spectatingAllowed?: boolean;
  status?: ListedMatchStatus;
  occupiedSeats?: ListedSeat[];
};

export type RecordPlayerJoinInput = {
  matchID: string;
  playerID: string;
  playerName: string;
};
