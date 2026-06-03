import type { BoardProps } from "boardgame.io/react";
import type { GameState } from "../../engine/src/game/state";
import type { CampaignProgress } from "../../engine/src/options/gameOptions";
import BoardLayout from "./ui/layout/BoardLayout";

export default function Board(props: BoardProps<GameState> & { onCampaignProgress?: (progress: CampaignProgress) => void }) {
  return <BoardLayout {...props} />;
}
