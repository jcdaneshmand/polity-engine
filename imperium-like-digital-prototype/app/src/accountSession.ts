export const ACCOUNT_SESSION_STORAGE_KEY = "polity-engine.accountSession.v1";

export type AccountRole = "player" | "admin";

export type AccountStatBucket = {
  gamesPlayed: number;
  wins: number;
  losses: number;
  unfinished: number;
  lastPlayedAt?: string;
};

export type AccountStats = {
  solo: {
    standard: AccountStatBucket;
    campaign: AccountStatBucket & {
      campaignsStarted: number;
      campaignsCompleted: number;
      bestRecord?: string;
    };
    practice: AccountStatBucket & {
      bestScore?: number;
    };
  };
  online: AccountStatBucket;
  byNation: Record<string, AccountStatBucket & {
    soloGamesPlayed: number;
    onlineGamesPlayed: number;
    campaignGamesPlayed: number;
    practiceGamesPlayed: number;
  }>;
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

export type AccountSessionRecord = {
  token: string;
  account: AccountPublicView;
};

function isStatBucket(value: unknown): value is AccountStatBucket {
  if (!value || typeof value !== "object") return false;
  const bucket = value as AccountStatBucket;
  return Number.isInteger(bucket.gamesPlayed)
    && Number.isInteger(bucket.wins)
    && Number.isInteger(bucket.losses)
    && Number.isInteger(bucket.unfinished);
}

function isAccount(value: unknown): value is AccountPublicView {
  if (!value || typeof value !== "object") return false;
  const account = value as AccountPublicView;
  return typeof account.id === "string"
    && typeof account.email === "string"
    && typeof account.username === "string"
    && (account.role === "player" || account.role === "admin")
    && typeof account.createdAt === "string"
    && typeof account.updatedAt === "string"
    && isStatBucket(account.stats?.solo?.standard)
    && isStatBucket(account.stats?.solo?.campaign)
    && isStatBucket(account.stats?.solo?.practice)
    && isStatBucket(account.stats?.online)
    && Boolean(account.stats?.byNation && typeof account.stats.byNation === "object");
}

export function serializeAccountSessionRecord(record: AccountSessionRecord): string {
  return JSON.stringify(record);
}

export function parseAccountSessionRecord(text: string | null | undefined): AccountSessionRecord | undefined {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as AccountSessionRecord;
    return typeof parsed.token === "string" && parsed.token.length > 0 && isAccount(parsed.account) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
