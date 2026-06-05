import { createRequire } from "node:module";

type BoardgameServerPackage = typeof import("boardgame.io/server");

const require = createRequire(import.meta.url);

export function getBoardgameServerPackage(): BoardgameServerPackage {
  return require("boardgame.io/dist/cjs/server.js") as BoardgameServerPackage;
}
