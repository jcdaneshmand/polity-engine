export function TurnStatusBar({ G, ctx, player, pending }: { G: any; ctx: any; player: any; pending?: { title: string; detail: string } }) {
  return <div className="panel turn-status">
    <div>
      <span className="eyebrow">Turn</span>
      <strong>Player {ctx.currentPlayer}</strong>
    </div>
    <div>{G.currentTurnType ?? "activate"}</div>
    <div>Actions {player?.actionTokensAvailable ?? 0}/{player?.actionTokensBase ?? 0}</div>
    <div>Exhaust {player?.exhaustTokensAvailable ?? 0}/{player?.exhaustTokensBase ?? 0}</div>
    {!pending ? <div>No pending choice</div> : null}
    {pending ? (
      <div className="current-task-strip">
        <span className="eyebrow">{pending.title}</span>
        <strong>{pending.detail}</strong>
      </div>
    ) : null}
  </div>;
}
