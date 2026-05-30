import type { ResourceName } from "../../../../engine/src/game/state";

export type ResourceLabels = Partial<Record<ResourceName, string>>;

const DEFAULT_RESOURCE_LABELS: Record<ResourceName, string> = {
  materials: "Materials",
  knowledge: "Progress",
  influence: "Population",
  unrest: "Unrest",
  goods: "Goods"
};

const CULTISTS_RESOURCE_LABELS: ResourceLabels = {
  influence: "People",
  knowledge: "Progress"
};

export function resourceLabelsForGame(G: any, currentPlayerId?: string): ResourceLabels {
  const currentNationId = G?.activeNationRulesets?.[currentPlayerId ?? ""]?.nationId;
  return currentNationId === "cultists" ? CULTISTS_RESOURCE_LABELS : {};
}

export function resourceLabel(resource: string, labels: ResourceLabels = {}): string {
  return labels[resource as ResourceName] ?? DEFAULT_RESOURCE_LABELS[resource as ResourceName] ?? resource;
}
