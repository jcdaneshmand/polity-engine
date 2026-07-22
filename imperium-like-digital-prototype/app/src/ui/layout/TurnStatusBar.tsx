import type { CurrentTaskUiState } from "../controller/selectionModel";

export function TurnStatusBar({ G, ctx, player, currentTask }: { G: any; ctx: any; player: any; currentTask: CurrentTaskUiState }) {
  return <div className="panel turn-status">
    <div>
      <span className="eyebrow">Turn</span>
      <strong>Player {ctx.currentPlayer}</strong>
    </div>
    <div>{G.currentTurnType ?? "activate"}</div>
    <div>Actions {player?.actionTokensAvailable ?? 0}/{player?.actionTokensBase ?? 0}</div>
    <div>Exhaust {player?.exhaustTokensAvailable ?? 0}/{player?.exhaustTokensBase ?? 0}</div>
    <div className={`current-task-strip${currentTask.suppressNormalActions ? " current-task-strip--blocking" : ""}`} data-choice-type={currentTask.choiceType ?? "ready"}>
      <span className="eyebrow">{currentTask.title}</span>
      <strong>{currentTask.detail}</strong>
    </div>
  </div>;
}
