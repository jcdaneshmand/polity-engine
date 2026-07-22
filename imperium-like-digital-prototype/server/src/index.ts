import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrototypeGame } from "../../engine/src/game/game";
import { createAccountStore } from "./accountStore";
import { createAccountMiddleware } from "./accounts";
import { getBoardgameServerPackage } from "./boardgameServer";
import { createBoardgameStorage, waitForBoardgameStorageIdle } from "./boardgameStorage";
import { createLobbyStore } from "./lobbyStore";
import { createBoardgameHttpApi, createPolityLobbyMiddleware } from "./polityLobby";
import { createPregameLobbyMiddleware } from "./pregameLobby";
import { createPregameLobbyStore } from "./pregameLobbyStore";
import { buildServerConfig } from "./serverConfig";
import { createStaticAppMiddleware } from "./staticApp";
import { createSupportMiddleware } from "./support";
import { createSupportStore } from "./supportStore";

const config = buildServerConfig(process.env);
const currentDir = dirname(fileURLToPath(import.meta.url));
const { Server, SocketIO } = getBoardgameServerPackage();
const db = createBoardgameStorage(config.boardgameStorageDir);
const accountStore = createAccountStore({ storageFile: config.accountStorageFile });
accountStore.ensureDefaultAdmin({
  email: "xenokinesis@local.admin",
  username: "Xenokinesis",
  password: "admin"
});
const lobbyStore = createLobbyStore({ storageFile: config.lobbyStorageFile });
const pregameLobbyStore = createPregameLobbyStore({ storageFile: config.pregameLobbyStorageFile });
const supportStore = createSupportStore({ storageFile: config.supportStorageFile });
const boardgameApi = createBoardgameHttpApi(`http://127.0.0.1:${config.port}`);
const server = Server({
  games: [PrototypeGame],
  origins: config.origins,
  apiOrigins: config.origins,
  transport: new SocketIO(),
  ...(db ? { db } : {})
});

server.app.use(createAccountMiddleware({ store: accountStore, buildCommit: config.buildCommit }));
server.app.use(createPregameLobbyMiddleware({
  store: pregameLobbyStore,
  boardgameApi,
  matchStore: lobbyStore,
  accountStore
}));
server.app.use(createPolityLobbyMiddleware({
  store: lobbyStore,
  boardgameApi
}));
server.app.use(createSupportMiddleware({ store: supportStore }));
server.app.use(createStaticAppMiddleware(join(currentDir, "../../app/dist")));

const runningServers = await server.run(config.port, () => {
  console.log(`Polity Engine multiplayer server listening on port ${config.port}`);
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down multiplayer server`);
  server.kill(runningServers);
  await waitForBoardgameStorageIdle(db);
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
