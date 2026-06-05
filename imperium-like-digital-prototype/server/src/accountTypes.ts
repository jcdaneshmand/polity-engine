export type AccountRole = "player" | "admin";

export type GameScope = "solo" | "online";
export type GameVariant = "standard" | "campaign" | "practice" | "multiplayer";
export type GameHistoryStatus = "started" | "completed" | "abandoned";
export type GameOutcome = "win" | "loss" | "unfinished" | "unknown";

export type StatBucket = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  unfinished: number;
  lastPlayedAt?: string;
};

export type AccountStats = {
  solo: {
    standard: StatBucket;
    campaign: StatBucket & {
      campaignsStarted: number;
      campaignsCompleted: number;
      bestRecord?: string;
    };
    practice: StatBucket & {
      bestScore?: number;
    };
  };
  online: StatBucket;
  byNation: Record<string, StatBucket & {
    soloGamesPlayed: number;
    onlineGamesPlayed: number;
    campaignGamesPlayed: number;
    practiceGamesPlayed: number;
  }>;
};

export type GameHistoryEntry = {
  id: string;
  accountID: string;
  scope: GameScope;
  variant: GameVariant;
  status: GameHistoryStatus;
  outcome: GameOutcome;
  sessionID?: string;
  matchID?: string;
  roomName?: string;
  playerID?: string;
  playerCount?: number;
  nationID?: string;
  nationName?: string;
  opponentNationIDs?: string[];
  opponentNationNames?: string[];
  winnerID?: string;
  winnerNationID?: string;
  reason?: string;
  scores?: Record<string, number>;
  tieBreakScores?: Record<string, number>;
  roundsPlayed?: number;
  finalResources?: Record<string, number>;
  finalDeckSize?: number;
  finalCardsInPlay?: number;
  finalUnrest?: number;
  finalFame?: number;
  rawSummaryStats?: Record<string, unknown>;
  campaignCompleted?: boolean;
  practiceScore?: number;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  countedAt?: string;
};

export type GameHistoryStartInput = Omit<GameHistoryEntry, "accountID" | "startedAt" | "updatedAt" | "countedAt"> & {
  startedAt?: string;
};

export type GameResultInput = {
  id: string;
  outcome: Exclude<GameOutcome, "unknown">;
  winnerID?: string;
  winnerNationID?: string;
  reason?: string;
  scores?: Record<string, number>;
  tieBreakScores?: Record<string, number>;
  roundsPlayed?: number;
  finalResources?: Record<string, number>;
  finalDeckSize?: number;
  finalCardsInPlay?: number;
  finalUnrest?: number;
  finalFame?: number;
  rawSummaryStats?: Record<string, unknown>;
  campaignCompleted?: boolean;
  practiceScore?: number;
};

export type AccountPublicView = {
  id: string;
  email: string;
  username: string;
  role: AccountRole;
  createdAt: string;
  updatedAt: string;
  stats: AccountStats;
};

export type AccountRecord = AccountPublicView & {
  emailKey: string;
  usernameKey: string;
  passwordSalt: string;
  passwordHash: string;
  history: GameHistoryEntry[];
};

export type AccountSessionRecord = {
  tokenHash: string;
  accountID: string;
  createdAt: string;
  lastSeenAt: string;
};

export type AccountPasswordResetRecord = {
  tokenHash: string;
  accountID: string;
  createdAt: string;
  usedAt?: string;
};

export type AccountStoreSnapshot = {
  accounts: AccountRecord[];
  sessions: AccountSessionRecord[];
  passwordResets?: AccountPasswordResetRecord[];
};
