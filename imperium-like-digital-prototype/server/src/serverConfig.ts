export type ServerEnvironment = Partial<Record<"PORT" | "POLITY_SERVER_PORT" | "POLITY_SERVER_ORIGIN" | "POLITY_STORAGE_PATH", string>>;

export type ServerConfig = {
  port: number;
  origins: Array<string | RegExp>;
  storageDir?: string;
  boardgameStorageDir?: string;
  accountStorageFile?: string;
  lobbyStorageFile?: string;
  pregameLobbyStorageFile?: string;
};

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function parsePort(value: string | undefined, name = "POLITY_SERVER_PORT"): number {
  if (!value) return 8000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535; received ${value}`);
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
  const storageDir = env.POLITY_STORAGE_PATH?.trim() || undefined;
  const normalizedStorageDir = storageDir?.replace(/[\\/]+$/, "");
  return {
    port: parsePort(env.POLITY_SERVER_PORT ?? env.PORT, env.POLITY_SERVER_PORT ? "POLITY_SERVER_PORT" : "PORT"),
    origins: parseOrigins(env.POLITY_SERVER_ORIGIN),
    storageDir,
    boardgameStorageDir: normalizedStorageDir ? `${normalizedStorageDir}/boardgame` : undefined,
    accountStorageFile: normalizedStorageDir ? `${normalizedStorageDir}/accounts.json` : undefined,
    lobbyStorageFile: normalizedStorageDir ? `${normalizedStorageDir}/lobby-matches.json` : undefined,
    pregameLobbyStorageFile: normalizedStorageDir ? `${normalizedStorageDir}/pregame-lobbies.json` : undefined
  };
}
