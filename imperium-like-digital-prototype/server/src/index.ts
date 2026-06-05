import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrototypeGame } from "../../engine/src/game/game";
import { getBoardgameServerPackage } from "./boardgameServer";
import { buildServerConfig } from "./serverConfig";
import { createStaticAppMiddleware } from "./staticApp";

const config = buildServerConfig(process.env);
const currentDir = dirname(fileURLToPath(import.meta.url));
const { FlatFile, Server, SocketIO } = getBoardgameServerPackage();
const db = config.storageDir ? new FlatFile({ dir: config.storageDir }) : undefined;
const server = Server({
  games: [PrototypeGame],
  origins: config.origins,
  apiOrigins: config.origins,
  transport: new SocketIO(),
  ...(db ? { db } : {})
});

server.app.use(createStaticAppMiddleware(join(currentDir, "../../app/dist")));

await server.run(config.port, () => {
  console.log(`Polity Engine multiplayer server listening on port ${config.port}`);
});
