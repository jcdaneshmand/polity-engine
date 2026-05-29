import { Client } from "boardgame.io/react";
import { PrototypeGame } from "../../engine/src/game/game";
import Board from "./Board";

const GameClient = Client({ game: PrototypeGame, board: Board, numPlayers: 2, debug: false });

export default function App() {
  return <GameClient />;
}
