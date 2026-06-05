import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

type KoaLikeContext = {
  path: string;
  method: string;
  body?: unknown;
  type?: string;
  set?: (name: string, value: string) => void;
};

type KoaLikeNext = () => Promise<void>;

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".txt": "text/plain"
};

function safeResolve(rootDir: string, requestPath: string): string | undefined {
  const root = resolve(rootDir);
  const relative = normalize(decodeURIComponent(requestPath)).replace(/^([/\\])+/, "");
  const candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return undefined;
  return candidate;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function serveFile(ctx: KoaLikeContext, path: string): Promise<void> {
  ctx.type = CONTENT_TYPES[extname(path)] ?? "application/octet-stream";
  ctx.body = await readFile(path);
}

export function createStaticAppMiddleware(distDir: string) {
  const indexPath = join(distDir, "index.html");
  return async (ctx: KoaLikeContext, next: KoaLikeNext): Promise<void> => {
    if (ctx.method !== "GET" && ctx.method !== "HEAD") {
      await next();
      return;
    }
    if (ctx.path.startsWith("/games") || !existsSync(indexPath)) {
      await next();
      return;
    }

    const requestedFile = safeResolve(distDir, ctx.path);
    if (requestedFile && await fileExists(requestedFile)) {
      await serveFile(ctx, requestedFile);
      return;
    }

    await serveFile(ctx, indexPath);
  };
}
