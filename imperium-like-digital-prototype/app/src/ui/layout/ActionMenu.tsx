export function ActionMenu({ actions, onAction }: { actions: any[]; onAction: (a:any)=>void }) {
  return <div className="panel actions">
    <div className="panel-title">Actions</div>
    {actions.map((a)=> <button key={a.label} disabled={!a.enabled} title={a.reason || ""} onClick={()=>onAction(a)}>
      <span>{a.label}</span>
      {!a.enabled ? <small>{a.reason || "Unavailable"}</small> : null}
    </button>)}
  </div>;
}
