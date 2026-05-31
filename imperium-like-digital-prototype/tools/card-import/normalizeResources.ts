const resourceAliases: Record<string, string> = {
  population: "influence",
  progress: "knowledge"
};
const importResourceNames = new Set(["materials", "population", "progress", "influence", "knowledge", "goods", "unrest"]);

export type InvalidResourceName = { path: string; resource: string };

function normalizeResourceName(value: unknown): unknown {
  return typeof value === "string" ? resourceAliases[value] ?? value : value;
}

function normalizeResourceMap(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([resource, amount]) => [
      normalizeResourceName(resource),
      amount
    ])
  );
}

function isImportResourceName(value: unknown): value is string {
  return typeof value === "string" && importResourceNames.has(value);
}

export function collectInvalidResourceNames(value: unknown, path = "$"): InvalidResourceName[] {
  const invalid: InvalidResourceName[] = [];
  const visit = (node: unknown, currentPath: string) => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${currentPath}[${index}]`));
      return;
    }
    if (!node || typeof node !== "object") return;

    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const childPath = `${currentPath}.${key}`;
      if (key === "resource" || key === "spendResource" || key === "placeResource") {
        if (!isImportResourceName(child)) invalid.push({ path: childPath, resource: String(child) });
        continue;
      }
      if (key === "resources") {
        if (Array.isArray(child)) {
          child.forEach((resource, index) => {
            if (!isImportResourceName(resource)) invalid.push({ path: `${childPath}[${index}]`, resource: String(resource) });
          });
        } else if (child && typeof child === "object") {
          Object.keys(child as Record<string, unknown>).forEach((resource) => {
            if (!isImportResourceName(resource)) invalid.push({ path: `${childPath}.${resource}`, resource });
          });
        }
        continue;
      }
      visit(child, childPath);
    }
  };
  visit(value, path);
  return invalid;
}

export function normalizeResourceNames<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => normalizeResourceNames(item)) as T;
  if (!value || typeof value !== "object") return normalizeResourceName(value) as T;

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "resource" || key === "spendResource" || key === "placeResource") {
      normalized[key] = normalizeResourceName(child);
    } else if (key === "resources" && Array.isArray(child)) {
      normalized[key] = child.map((item) => normalizeResourceName(item));
    } else if (key === "resources") {
      normalized[key] = normalizeResourceMap(child);
    } else {
      normalized[key] = normalizeResourceNames(child);
    }
  }
  return normalized as T;
}
