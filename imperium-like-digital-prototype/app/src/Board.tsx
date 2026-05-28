import type { BoardProps } from "boardgame.io/react";
import type { GameState } from "../../engine/src/game/state";
import BoardLayout from "./ui/layout/BoardLayout";

export default function Board(props: BoardProps<GameState>) {
  return <BoardLayout {...props} />;
}
