import type { AccountStore } from "./accountStore";
import type { AccountPublicView, GameHistoryStartInput, GameResultInput } from "./accountTypes";

type KoaLikeContext = {
  method: string;
  path: string;
  headers?: Record<string, string | string[] | undefined>;
  request?: { body?: unknown };
  req?: AsyncIterable<Buffer | string>;
  status?: number;
  body?: unknown;
};

type KoaLikeNext = () => Promise<void>;

type AccountMiddlewareOptions = {
  store: AccountStore;
};

type AuthResult =
  | { ok: true; account: AccountPublicView }
  | { ok: false; status: number; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function readJSONBody(ctx: KoaLikeContext): Promise<unknown> {
  if (ctx.request && "body" in ctx.request) return ctx.request.body;
  if (!ctx.req) return undefined;
  let text = "";
  for await (const chunk of ctx.req) text += chunk.toString();
  if (!text.trim()) return undefined;
  return JSON.parse(text);
}

function setError(ctx: KoaLikeContext, status: number, error: string): void {
  ctx.status = status;
  ctx.body = { error };
}

function accountErrorStatus(reason: string): number {
  if (reason === "email_taken" || reason === "username_taken") return 409;
  if (reason === "invalid_credentials" || reason === "invalid_session" || reason === "missing_session") return 401;
  if (reason === "account_not_found" || reason === "history_not_found") return 404;
  return 400;
}

export function bearerToken(ctx: KoaLikeContext): string | undefined {
  const raw = ctx.headers?.authorization ?? ctx.headers?.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

export function requireAccount(ctx: KoaLikeContext, store: AccountStore): AuthResult {
  const token = bearerToken(ctx);
  if (!token) return { ok: false, status: 401, reason: "missing_session" };
  const resolved = store.resolveSession(token);
  if (!resolved.ok) return { ok: false, status: accountErrorStatus(resolved.reason), reason: resolved.reason };
  return { ok: true, account: resolved.account };
}

export function resolveOptionalAccount(ctx: KoaLikeContext, store: AccountStore): { ok: true; account?: AccountPublicView } | AuthResult {
  const token = bearerToken(ctx);
  if (!token) return { ok: true };
  return requireAccount(ctx, store);
}

export function requireAdmin(ctx: KoaLikeContext, store: AccountStore): AuthResult {
  const account = requireAccount(ctx, store);
  if (!account.ok) return account;
  if (account.account.role !== "admin") return { ok: false, status: 403, reason: "not_admin" };
  return account;
}

function historyStartInput(body: Record<string, unknown>): GameHistoryStartInput | undefined {
  const id = stringValue(body.id);
  const scope = stringValue(body.scope);
  const variant = stringValue(body.variant);
  const status = stringValue(body.status);
  const outcome = stringValue(body.outcome);
  if (!id || scope !== "solo" && scope !== "online") return undefined;
  if (variant !== "standard" && variant !== "campaign" && variant !== "practice" && variant !== "multiplayer") return undefined;
  if (status !== "started" && status !== "completed" && status !== "abandoned") return undefined;
  if (outcome !== "win" && outcome !== "loss" && outcome !== "unfinished" && outcome !== "unknown") return undefined;
  return {
    id,
    scope,
    variant,
    status,
    outcome,
    ...(stringValue(body.sessionID) ? { sessionID: stringValue(body.sessionID) } : {}),
    ...(stringValue(body.matchID) ? { matchID: stringValue(body.matchID) } : {}),
    ...(stringValue(body.roomName) ? { roomName: stringValue(body.roomName) } : {}),
    ...(stringValue(body.playerID) ? { playerID: stringValue(body.playerID) } : {}),
    ...(typeof body.playerCount === "number" ? { playerCount: body.playerCount } : {}),
    ...(stringValue(body.nationID) ? { nationID: stringValue(body.nationID) } : {}),
    ...(stringValue(body.nationName) ? { nationName: stringValue(body.nationName) } : {}),
    ...(Array.isArray(body.opponentNationIDs) ? { opponentNationIDs: body.opponentNationIDs.filter((item): item is string => typeof item === "string") } : {}),
    ...(Array.isArray(body.opponentNationNames) ? { opponentNationNames: body.opponentNationNames.filter((item): item is string => typeof item === "string") } : {})
  };
}

function resultInput(body: Record<string, unknown>): GameResultInput | undefined {
  const id = stringValue(body.id);
  const outcome = stringValue(body.outcome);
  if (!id || outcome !== "win" && outcome !== "loss" && outcome !== "unfinished") return undefined;
  return {
    id,
    outcome,
    ...(stringValue(body.winnerID) ? { winnerID: stringValue(body.winnerID) } : {}),
    ...(stringValue(body.winnerNationID) ? { winnerNationID: stringValue(body.winnerNationID) } : {}),
    ...(stringValue(body.reason) ? { reason: stringValue(body.reason) } : {}),
    ...(isRecord(body.scores) ? { scores: body.scores as Record<string, number> } : {}),
    ...(isRecord(body.tieBreakScores) ? { tieBreakScores: body.tieBreakScores as Record<string, number> } : {}),
    ...(typeof body.roundsPlayed === "number" ? { roundsPlayed: body.roundsPlayed } : {}),
    ...(isRecord(body.finalResources) ? { finalResources: body.finalResources as Record<string, number> } : {}),
    ...(typeof body.finalDeckSize === "number" ? { finalDeckSize: body.finalDeckSize } : {}),
    ...(typeof body.finalCardsInPlay === "number" ? { finalCardsInPlay: body.finalCardsInPlay } : {}),
    ...(typeof body.finalUnrest === "number" ? { finalUnrest: body.finalUnrest } : {}),
    ...(typeof body.finalFame === "number" ? { finalFame: body.finalFame } : {}),
    ...(isRecord(body.rawSummaryStats) ? { rawSummaryStats: body.rawSummaryStats } : {}),
    ...(typeof body.campaignCompleted === "boolean" ? { campaignCompleted: body.campaignCompleted } : {}),
    ...(typeof body.practiceScore === "number" ? { practiceScore: body.practiceScore } : {})
  };
}

export function createAccountMiddleware(options: AccountMiddlewareOptions) {
  return async (ctx: KoaLikeContext, next: KoaLikeNext): Promise<void> => {
    if (!ctx.path.startsWith("/polity/accounts")) {
      await next();
      return;
    }

    if (ctx.method === "GET" && ctx.path === "/polity/accounts/health") {
      ctx.body = { ok: true };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/accounts/register") {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !stringValue(body.email) || !stringValue(body.username) || !stringValue(body.password)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const email = stringValue(body.email) as string;
      const username = stringValue(body.username) as string;
      const password = stringValue(body.password) as string;
      const created = options.store.createAccount({ email, username, password });
      if (!created.ok) {
        setError(ctx, accountErrorStatus(created.reason), created.reason);
        return;
      }
      ctx.status = 201;
      ctx.body = { account: created.account, token: created.token };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/accounts/sign-in") {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !stringValue(body.login) || !stringValue(body.password)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const login = stringValue(body.login) as string;
      const password = stringValue(body.password) as string;
      const signedIn = options.store.signIn({ login, password });
      if (!signedIn.ok) {
        setError(ctx, accountErrorStatus(signedIn.reason), signedIn.reason);
        return;
      }
      ctx.body = { account: signedIn.account, token: signedIn.token };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/accounts/forgot-password") {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !stringValue(body.email)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const email = stringValue(body.email) as string;
      const resetURLBase = stringValue(body.resetURLBase);
      const requested = options.store.requestPasswordReset({ email, resetURLBase });
      ctx.body = { ok: true, ...(requested.resetLink ? { resetLink: requested.resetLink } : {}) };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/accounts/reset-password") {
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !stringValue(body.token) || !stringValue(body.password) || !stringValue(body.passwordConfirmation)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const token = stringValue(body.token) as string;
      const password = stringValue(body.password) as string;
      const passwordConfirmation = stringValue(body.passwordConfirmation) as string;
      const reset = options.store.completePasswordReset({ token, password, passwordConfirmation });
      if (!reset.ok) {
        setError(ctx, accountErrorStatus(reset.reason), reset.reason);
        return;
      }
      ctx.body = { ok: true };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/accounts/change-password") {
      const account = requireAccount(ctx, options.store);
      if (!account.ok) {
        setError(ctx, account.status, account.reason);
        return;
      }
      const body = await readJSONBody(ctx);
      if (!isRecord(body) || !stringValue(body.currentPassword) || !stringValue(body.password)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const currentPassword = stringValue(body.currentPassword) as string;
      const password = stringValue(body.password) as string;
      const changed = options.store.changePassword(account.account.id, { currentPassword, password });
      if (!changed.ok) {
        setError(ctx, accountErrorStatus(changed.reason), changed.reason);
        return;
      }
      ctx.body = { ok: true };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/accounts/sign-out") {
      const token = bearerToken(ctx);
      if (token) options.store.signOut(token);
      ctx.body = { ok: true };
      return;
    }

    if (ctx.method === "GET" && ctx.path === "/polity/accounts/me") {
      const account = requireAccount(ctx, options.store);
      if (!account.ok) {
        setError(ctx, account.status, account.reason);
        return;
      }
      ctx.body = { account: account.account };
      return;
    }

    if (ctx.method === "GET" && ctx.path === "/polity/accounts/history") {
      const account = requireAccount(ctx, options.store);
      if (!account.ok) {
        setError(ctx, account.status, account.reason);
        return;
      }
      const history = options.store.listHistory(account.account.id);
      if (!history.ok) {
        setError(ctx, accountErrorStatus(history.reason), history.reason);
        return;
      }
      ctx.body = { history: history.history, stats: history.stats };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/accounts/history/start") {
      const account = requireAccount(ctx, options.store);
      if (!account.ok) {
        setError(ctx, account.status, account.reason);
        return;
      }
      const body = await readJSONBody(ctx);
      if (!isRecord(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const input = historyStartInput(body);
      if (!input) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const result = options.store.recordGameStart(account.account.id, input);
      if (!result.ok) {
        setError(ctx, accountErrorStatus(result.reason), result.reason);
        return;
      }
      ctx.body = { entry: result.entry };
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/accounts/history/result") {
      const account = requireAccount(ctx, options.store);
      if (!account.ok) {
        setError(ctx, account.status, account.reason);
        return;
      }
      const body = await readJSONBody(ctx);
      if (!isRecord(body)) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const input = resultInput(body);
      if (!input) {
        setError(ctx, 400, "invalid_request");
        return;
      }
      const result = options.store.recordGameResult(account.account.id, input);
      if (!result.ok) {
        setError(ctx, accountErrorStatus(result.reason), result.reason);
        return;
      }
      ctx.body = { entry: result.entry, stats: result.stats };
      return;
    }

    await next();
  };
}
