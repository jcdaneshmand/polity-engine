import type { ResourceName } from "../../../engine/src/game/state";

export function ResourcePanel({ resources }: { resources: Record<ResourceName, number> }) {
  return <div className="panel">{Object.entries(resources).map(([k, v]) => <div key={k}>{k}: {v}</div>)}</div>;
}
