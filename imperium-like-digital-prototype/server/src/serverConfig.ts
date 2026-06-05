export type ServerEnvironment = Partial<Record<"POLITY_SERVER_PORT" | "POLITY_SERVER_ORIGIN" | "POLITY_STORAGE_PATH", string>>;

export type ServerConfig = {
  port: number;
  origins: Array<string | RegExp>;
  storageDir?: string;
};

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function parsePort(value: string | undefined): number {
  if (!value) return 8000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`POLITY_SERVER_PORT must be an integer between 1 and 65535; received ${value}`);
  }
  return port;
}

function parseOrigins(value: string | undefined): Array<string | RegExp> {
  if (!value?.trim()) return [LOCALHOST_ORIGIN];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function buildServerConfig(env: ServerEnvironment): ServerConfig {
  return {
    port: parsePort(env.POLITY_SERVER_PORT),
    origins: parseOrigins(env.POLITY_SERVER_ORIGIN),
    storageDir: env.POLITY_STORAGE_PATH?.trim() || undefined
  };
}
