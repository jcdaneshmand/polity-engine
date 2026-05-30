import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCardEntryService } from "./cardEntryService";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(currentDir, "../..");
const publicDir = path.join(currentDir, "public");
const port = Number(process.env.CARD_ENTRY_PORT || 4177);
const service = createCardEntryService({ root });

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res: http.ServerResponse, requestPath: string) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.resolve(publicDir, `.${safePath}`);
  const normalizedPublicDir = publicDir.endsWith(path.sep) ? publicDir : `${publicDir}${path.sep}`;

  if (filePath !== publicDir && !filePath.startsWith(normalizedPublicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  const type = ext === ".js" ? "text/javascript" : ext === ".css" ? "text/css" : "text/html";
  res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
  res.end(fs.readFileSync(filePath));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/session") {
      sendJson(res, 200, service.getSession());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/cards") {
      const body = await readJson(req);
      sendJson(res, 200, service.saveDraft((body as { draft: any }).draft));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/validate") {
      sendJson(res, 200, service.validateAll());
      return;
    }

    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, () => {
  console.log(`Private card entry desk: http://localhost:${port}`);
});
