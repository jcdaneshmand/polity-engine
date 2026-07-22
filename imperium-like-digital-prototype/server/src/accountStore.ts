import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeJsonFileSync } from "./jsonFileStore";
import type {
  AccountPublicView,
  AccountPasswordResetRecord,
  AccountRecord,
  AccountSessionRecord,
  AccountStats,
  AccountStoreSnapshot,
  GameHistoryEntry,
  GameHistoryStartInput,
  GameResultInput,
  GameVariant,
  StatBucket
} from "./accountTypes";

type AccountStoreOptions = {
  now?: () => string;
  createID?: () => string;
  createToken?: () => string;
  createSalt?: () => string;
  saltPassword?: (password: string, salt: string) => string;
  snapshot?: AccountStoreSnapshot;
  storageFile?: string;
  sessionTtlMs?: number;
  passwordResetTtlMs?: number;
};

type AccountCreateInput = {
  email: string;
  username: string;
  password: string;
};

type AccountFailureReason =
  | "email_taken"
  | "username_taken"
  | "invalid_account"
  | "invalid_credentials"
  | "invalid_session"
  | "account_not_found"
  | "history_not_found";

const MIN_PASSWORD_LENGTH = 4;
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function key(value: string): string {
  return value.trim().toLowerCase();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function defaultSaltPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function defaultStats(): AccountStats {
  return {
    solo: {
      standard: defaultBucket(),
      campaign: { ...defaultBucket(), campaignsStarted: 0, campaignsCompleted: 0 },
      practice: defaultBucket()
    },
    online: defaultBucket(),
    byNation: {}
  };
}

function defaultBucket(): StatBucket {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    unfinished: 0
  };
}

function publicAccount(account: AccountRecord): AccountPublicView {
  return {
    id: account.id,
    email: account.email,
    username: account.username,
    role: account.role,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    stats: account.stats
  };
}

function updateBucket(bucket: StatBucket, outcome: "win" | "loss" | "unfinished", playedAt: string): void {
  bucket.gamesPlayed += 1;
  if (outcome === "win") bucket.wins += 1;
  else if (outcome === "loss") bucket.losses += 1;
  else bucket.unfinished += 1;
  bucket.lastPlayedAt = playedAt;
}

function statOutcome(outcome: GameResultInput["outcome"]): "win" | "loss" | "unfinished" {
  return outcome === "win" || outcome === "loss" ? outcome : "unfinished";
}

function soloVariantBucket(stats: AccountStats, variant: GameVariant): StatBucket {
  if (variant === "campaign") return stats.solo.campaign;
  if (variant === "practice") return stats.solo.practice;
  return stats.solo.standard;
}

function nationBucket(stats: AccountStats, nationID: string): AccountStats["byNation"][string] {
  stats.byNation[nationID] ??= {
    ...defaultBucket(),
    soloGamesPlayed: 0,
    onlineGamesPlayed: 0,
    campaignGamesPlayed: 0,
    practiceGamesPlayed: 0
  };
  return stats.byNation[nationID];
}

function safePasswordMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAccountStore(options: AccountStoreOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const createID = options.createID ?? (() => randomUUID());
  const createToken = options.createToken ?? (() => randomBytes(32).toString("base64url"));
  const createSalt = options.createSalt ?? (() => randomBytes(16).toString("hex"));
  const saltPassword = options.saltPassword ?? defaultSaltPassword;
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const passwordResetTtlMs = options.passwordResetTtlMs ?? DEFAULT_PASSWORD_RESET_TTL_MS;
  const loadedSnapshot = options.snapshot ?? loadSnapshot(options.storageFile);
  const accounts = new Map<string, AccountRecord>((loadedSnapshot?.accounts ?? []).map((account) => [account.id, account]));
  const sessions = new Map<string, AccountSessionRecord>((loadedSnapshot?.sessions ?? []).map((session) => [session.tokenHash, session]));
  const passwordResets = new Map<string, AccountPasswordResetRecord>((loadedSnapshot?.passwordResets ?? []).map((reset) => [reset.tokenHash, reset]));

  function snapshot(): AccountStoreSnapshot {
    pruneExpiredRecords();
    return {
      accounts: Array.from(accounts.values()),
      sessions: Array.from(sessions.values()),
      passwordResets: Array.from(passwordResets.values())
    };
  }

  function persist(): void {
    if (!options.storageFile) return;
    writeJsonFileSync(options.storageFile, snapshot());
  }

  function isExpired(timestamp: string, ttlMs: number): boolean {
    return Date.parse(now()) - Date.parse(timestamp) > ttlMs;
  }

  function pruneExpiredRecords(): void {
    for (const [hash, session] of sessions.entries()) {
      if (isExpired(session.lastSeenAt, sessionTtlMs)) sessions.delete(hash);
    }
    for (const [hash, reset] of passwordResets.entries()) {
      if (reset.usedAt || isExpired(reset.createdAt, passwordResetTtlMs)) passwordResets.delete(hash);
    }
  }

  function findByEmail(email: string): AccountRecord | undefined {
    const emailKey = key(email);
    return Array.from(accounts.values()).find((account) => account.emailKey === emailKey);
  }

  function findByUsername(username: string): AccountRecord | undefined {
    const usernameKey = key(username);
    return Array.from(accounts.values()).find((account) => account.usernameKey === usernameKey);
  }

  function sessionForAccount(account: AccountRecord): { account: AccountPublicView; token: string } {
    const token = createToken();
    const timestamp = now();
    sessions.set(tokenHash(token), {
      tokenHash: tokenHash(token),
      accountID: account.id,
      createdAt: timestamp,
      lastSeenAt: timestamp
    });
    persist();
    return { account: publicAccount(account), token };
  }

  function invalidateAccountSessions(accountID: string): void {
    for (const [hash, session] of sessions.entries()) {
      if (session.accountID === accountID) sessions.delete(hash);
    }
  }

  function setPassword(account: AccountRecord, password: string, timestamp: string): void {
    const salt = createSalt();
    account.passwordSalt = salt;
    account.passwordHash = saltPassword(password, salt);
    account.updatedAt = timestamp;
    invalidateAccountSessions(account.id);
  }

  function accountWithPassword(input: AccountCreateInput, role: AccountRecord["role"]): AccountRecord | { reason: AccountFailureReason } {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    const password = input.password;
    if (!email || !username || password.length < MIN_PASSWORD_LENGTH) return { reason: "invalid_account" };
    const timestamp = now();
    const salt = createSalt();
    return {
      id: createID(),
      email,
      username,
      emailKey: key(email),
      usernameKey: key(username),
      passwordSalt: salt,
      passwordHash: saltPassword(password, salt),
      role,
      createdAt: timestamp,
      updatedAt: timestamp,
      stats: defaultStats(),
      history: []
    };
  }

  function countResult(account: AccountRecord, entry: GameHistoryEntry, result: GameResultInput, timestamp: string): void {
    if (entry.countedAt) return;
    const outcome = statOutcome(result.outcome);
    if (entry.scope === "online") {
      updateBucket(account.stats.online, outcome, timestamp);
    } else {
      const bucket = soloVariantBucket(account.stats, entry.variant);
      updateBucket(bucket, outcome, timestamp);
      if (entry.variant === "campaign") {
        account.stats.solo.campaign.campaignsStarted += 1;
        if (result.campaignCompleted) account.stats.solo.campaign.campaignsCompleted += 1;
        account.stats.solo.campaign.bestRecord ??= `${account.stats.solo.campaign.wins}-${account.stats.solo.campaign.losses}`;
      }
      if (entry.variant === "practice" && result.practiceScore !== undefined) {
        account.stats.solo.practice.bestScore = Math.max(account.stats.solo.practice.bestScore ?? result.practiceScore, result.practiceScore);
      }
    }
    if (entry.nationID) {
      const bucket = nationBucket(account.stats, entry.nationID);
      updateBucket(bucket, outcome, timestamp);
      if (entry.scope === "online") bucket.onlineGamesPlayed += 1;
      else bucket.soloGamesPlayed += 1;
      if (entry.variant === "campaign") bucket.campaignGamesPlayed += 1;
      if (entry.variant === "practice") bucket.practiceGamesPlayed += 1;
    }
    entry.countedAt = timestamp;
  }

  return {
    createAccount(input: AccountCreateInput): { ok: true; account: AccountPublicView; token: string } | { ok: false; reason: AccountFailureReason } {
      const email = input.email.trim().toLowerCase();
      const username = input.username.trim();
      if (!email || !username || input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "invalid_account" };
      if (findByEmail(email)) return { ok: false, reason: "email_taken" };
      if (findByUsername(username)) return { ok: false, reason: "username_taken" };
      const account = accountWithPassword(input, accounts.size === 0 ? "admin" : "player");
      if ("reason" in account) return { ok: false, reason: account.reason };
      accounts.set(account.id, account);
      return { ok: true, ...sessionForAccount(account) };
    },

    createAccountWithRole(input: AccountCreateInput & { role: AccountRecord["role"] }): { ok: true; account: AccountPublicView; token: string } | { ok: false; reason: AccountFailureReason } {
      const email = input.email.trim().toLowerCase();
      const username = input.username.trim();
      if (!email || !username || input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "invalid_account" };
      if (findByEmail(email)) return { ok: false, reason: "email_taken" };
      if (findByUsername(username)) return { ok: false, reason: "username_taken" };
      const account = accountWithPassword(input, input.role);
      if ("reason" in account) return { ok: false, reason: account.reason };
      accounts.set(account.id, account);
      return { ok: true, ...sessionForAccount(account) };
    },

    ensureDefaultAdmin(input: AccountCreateInput): { ok: true; account: AccountPublicView } | { ok: false; reason: AccountFailureReason } {
      const existing = findByEmail(input.email) ?? findByUsername(input.username);
      if (existing) {
        existing.role = "admin";
        existing.updatedAt = now();
        persist();
        return { ok: true, account: publicAccount(existing) };
      }
      if (findByEmail(input.email)) return { ok: false, reason: "email_taken" };
      if (findByUsername(input.username)) return { ok: false, reason: "username_taken" };
      const account = accountWithPassword(input, "admin");
      if ("reason" in account) return { ok: false, reason: account.reason };
      accounts.set(account.id, account);
      persist();
      return { ok: true, account: publicAccount(account) };
    },

    signIn(input: { login: string; password: string }): { ok: true; account: AccountPublicView; token: string } | { ok: false; reason: AccountFailureReason } {
      const account = findByEmail(input.login) ?? findByUsername(input.login);
      if (!account) return { ok: false, reason: "invalid_credentials" };
      const candidate = saltPassword(input.password, account.passwordSalt);
      if (!safePasswordMatch(candidate, account.passwordHash)) return { ok: false, reason: "invalid_credentials" };
      return { ok: true, ...sessionForAccount(account) };
    },

    signOut(token: string): { ok: true } {
      sessions.delete(tokenHash(token));
      persist();
      return { ok: true };
    },

    requestPasswordReset(input: { email: string; resetURLBase?: string }): { ok: true; resetLink?: string; resetToken?: string } {
      pruneExpiredRecords();
      const account = findByEmail(input.email);
      if (!account) return { ok: true };
      const token = createToken();
      const timestamp = now();
      passwordResets.set(tokenHash(token), {
        tokenHash: tokenHash(token),
        accountID: account.id,
        createdAt: timestamp
      });
      persist();
      const resetLink = input.resetURLBase
        ? `${input.resetURLBase}${input.resetURLBase.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
        : undefined;
      return { ok: true, ...(resetLink ? { resetLink } : {}), resetToken: token };
    },

    completePasswordReset(input: { token: string; password: string; passwordConfirmation: string }): { ok: true } | { ok: false; reason: AccountFailureReason } {
      if (!input.token.trim()) return { ok: false, reason: "invalid_session" };
      if (input.password.length < MIN_PASSWORD_LENGTH || input.password !== input.passwordConfirmation) return { ok: false, reason: "invalid_account" };
      const hash = tokenHash(input.token);
      const reset = passwordResets.get(hash);
      if (!reset || reset.usedAt || isExpired(reset.createdAt, passwordResetTtlMs)) {
        if (reset) {
          passwordResets.delete(hash);
          persist();
        }
        return { ok: false, reason: "invalid_session" };
      }
      const account = accounts.get(reset.accountID);
      if (!account) return { ok: false, reason: "account_not_found" };
      const timestamp = now();
      setPassword(account, input.password, timestamp);
      reset.usedAt = timestamp;
      passwordResets.delete(hash);
      persist();
      return { ok: true };
    },

    changePassword(accountID: string, input: { currentPassword: string; password: string }): { ok: true } | { ok: false; reason: AccountFailureReason } {
      const account = accounts.get(accountID);
      if (!account) return { ok: false, reason: "account_not_found" };
      if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "invalid_account" };
      const candidate = saltPassword(input.currentPassword, account.passwordSalt);
      if (!safePasswordMatch(candidate, account.passwordHash)) return { ok: false, reason: "invalid_credentials" };
      setPassword(account, input.password, now());
      persist();
      return { ok: true };
    },

    resolveSession(token: string): { ok: true; account: AccountPublicView } | { ok: false; reason: AccountFailureReason } {
      const session = sessions.get(tokenHash(token));
      if (!session) return { ok: false, reason: "invalid_session" };
      if (isExpired(session.lastSeenAt, sessionTtlMs)) {
        sessions.delete(tokenHash(token));
        persist();
        return { ok: false, reason: "invalid_session" };
      }
      const account = accounts.get(session.accountID);
      if (!account) return { ok: false, reason: "account_not_found" };
      session.lastSeenAt = now();
      persist();
      return { ok: true, account: publicAccount(account) };
    },

    getAccount(accountID: string): AccountPublicView | undefined {
      const account = accounts.get(accountID);
      return account ? publicAccount(account) : undefined;
    },

    listHistory(accountID: string): { ok: true; history: GameHistoryEntry[]; stats: AccountStats } | { ok: false; reason: AccountFailureReason } {
      const account = accounts.get(accountID);
      if (!account) return { ok: false, reason: "account_not_found" };
      return { ok: true, history: [...account.history], stats: account.stats };
    },

    recordGameStart(accountID: string, input: GameHistoryStartInput): { ok: true; entry: GameHistoryEntry } | { ok: false; reason: AccountFailureReason } {
      const account = accounts.get(accountID);
      if (!account) return { ok: false, reason: "account_not_found" };
      const existing = account.history.find((entry) => entry.id === input.id);
      if (existing) return { ok: true, entry: existing };
      const timestamp = input.startedAt ?? now();
      const entry: GameHistoryEntry = {
        ...input,
        accountID,
        startedAt: timestamp,
        updatedAt: timestamp
      };
      account.history.push(entry);
      account.updatedAt = timestamp;
      persist();
      return { ok: true, entry };
    },

    recordGameResult(accountID: string, input: GameResultInput): { ok: true; entry: GameHistoryEntry; stats: AccountStats } | { ok: false; reason: AccountFailureReason } {
      const account = accounts.get(accountID);
      if (!account) return { ok: false, reason: "account_not_found" };
      const entry = account.history.find((candidate) => candidate.id === input.id);
      if (!entry) return { ok: false, reason: "history_not_found" };
      const timestamp = now();
      Object.assign(entry, {
        ...input,
        status: "completed" as const,
        updatedAt: timestamp,
        endedAt: entry.endedAt ?? timestamp
      });
      countResult(account, entry, input, timestamp);
      account.updatedAt = timestamp;
      persist();
      return { ok: true, entry, stats: account.stats };
    },

    toPublicAccount: publicAccount,

    snapshot
  };
}

export type AccountStore = ReturnType<typeof createAccountStore>;

function loadSnapshot(storageFile: string | undefined): AccountStoreSnapshot | undefined {
  if (!storageFile || !existsSync(storageFile)) return undefined;
  const parsed = JSON.parse(readFileSync(storageFile, "utf8")) as AccountStoreSnapshot;
  return {
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    passwordResets: Array.isArray(parsed.passwordResets) ? parsed.passwordResets : []
  };
}
