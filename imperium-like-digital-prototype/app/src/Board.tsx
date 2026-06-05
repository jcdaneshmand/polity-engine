import type { BoardProps } from "boardgame.io/react";
import type { GameState } from "../../engine/src/game/state";
import type { CampaignProgress } from "../../engine/src/options/gameOptions";
import type { AccountGameResultInput } from "./onlineSession";
import BoardLayout from "./ui/layout/BoardLayout";
import type { AccountGameResultContext } from "./ui/layout/EndGameSummary";

export type PolityBoardProps = BoardProps<GameState> & {
  viewerPlayerID?: string | null;
  onCampaignProgress?: (progress: CampaignProgress) => void;
  accountResultContext?: AccountGameResultContext;
  onAccountGameResult?: (result: AccountGameResultInput) => void;
};

export default function Board(props: PolityBoardProps) {
  return <BoardLayout {...props} />;
}
