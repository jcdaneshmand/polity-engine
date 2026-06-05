import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrototypeGame } from "../../engine/src/game/game";
import { createAccountStore } from "./accountStore";
import { createAccountMiddleware } from "./accounts";
import { getBoardgameServerPackage } from "./boardgameServer";
import { createLobbyStore } from "./lobbyStore";
import { createBoardgameHttpApi, createPolityLobbyMiddleware } from "./polityLobby";
import { createPregameLobbyMiddleware } from "./pregameLobby";
import { createPregameLobbyStore } from "./pregameLobbyStore";
import { buildServerConfig } from "./serverConfig";
import { createStaticAppMiddleware } from "./staticApp";

const config = buildServerConfig(process.env);
const currentDir = dirname(fileURLToPath(import.meta.url));
const { FlatFile, Server, SocketIO } = getBoardgameServerPackage();
const db = config.storageDir ? new FlatFile({ dir: config.storageDir }) : undefined;
const accountStore = createAccountStore({ storageFile: config.accountStorageFile });
accountStore.ensureDefaultAdmin({
  email: "xenokinesis@local.admin",
  username: "Xenokinesis",
  password: "admin"
});
const lobbyStore = createLobbyStore();
const pregameLobbyStore = createPregameLobbyStore();
const boardgameApi = createBoardgameHttpApi(`http://127.0.0.1:${config.port}`);
const server = Server({
  games: [PrototypeGame],
  origins: config.origins,
  apiOrigins: config.origins,
  transport: new SocketIO(),
  ...(db ? { db } : {})
});

server.app.use(createAccountMiddleware({ store: accountStore }));
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
server.app.use(createStaticAppMiddleware(join(currentDir, "../../app/dist")));

await server.run(config.port, () => {
  console.log(`Polity Engine multiplayer server listening on port ${config.port}`);
});
