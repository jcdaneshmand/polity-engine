type NodeFs = {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
};

type NodePath = {
  resolve(...parts: string[]): string;
};

type NodeProcess = {
  cwd?: () => string;
  getBuiltinModule?: (name: string) => unknown;
};

function getNodeProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

export function getNodeFs(): NodeFs | undefined {
  return getNodeProcess()?.getBuiltinModule?.("fs") as NodeFs | undefined;
}

export function resolveFromCwd(...parts: string[]): string {
  const process = getNodeProcess();
  const cwd = process?.cwd?.() ?? ".";
  const path = process?.getBuiltinModule?.("path") as NodePath | undefined;
  return path?.resolve(cwd, ...parts) ?? [cwd, ...parts].join("/");
}
