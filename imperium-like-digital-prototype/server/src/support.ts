import { requireAdmin } from "./accounts";
import type { AccountStore } from "./accountStore";
import type { SupportStore } from "./supportStore";

type KoaLikeContext = {
  method: string;
  path: string;
  headers?: Record<string, string | string[] | undefined>;
  status?: number;
  body?: unknown;
};

type KoaLikeNext = () => Promise<void>;

type SupportMiddlewareOptions = {
  store: SupportStore;
  accountStore: AccountStore;
};

export function createSupportMiddleware(options: SupportMiddlewareOptions) {
  return async (ctx: KoaLikeContext, next: KoaLikeNext): Promise<void> => {
    if (!ctx.path.startsWith("/polity/support")) {
      await next();
      return;
    }

    if (ctx.method === "GET" && ctx.path === "/polity/support/monthly") {
      ctx.body = options.store.currentStatus();
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/polity/support/monthly/mark-covered") {
      const admin = requireAdmin(ctx, options.accountStore);
      if (!admin.ok) {
        ctx.status = admin.status;
        ctx.body = { error: admin.reason };
        return;
      }
      ctx.body = options.store.markCurrentMonthCovered();
      return;
    }

    ctx.status = 404;
    ctx.body = { error: "not_found" };
  };
}
