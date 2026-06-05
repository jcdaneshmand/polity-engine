import { describe, expect, it } from "vitest";
import { buildServerConfig } from "./serverConfig";

describe("server config", () => {
  it("uses safe local defaults for multiplayer development", () => {
    expect(buildServerConfig({})).toEqual({
      port: 8000,
      origins: [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
      storageDir: undefined,
      accountStorageFile: undefined
    });
  });

  it("parses explicit environment overrides", () => {
    expect(buildServerConfig({
      POLITY_SERVER_PORT: "9001",
      POLITY_SERVER_ORIGIN: "http://localhost:5173,https://polity.example",
      POLITY_STORAGE_PATH: "tmp/multiplayer"
    })).toEqual({
      port: 9001,
      origins: ["http://localhost:5173", "https://polity.example"],
      storageDir: "tmp/multiplayer",
      accountStorageFile: "tmp/multiplayer/accounts.json"
    });
  });

  it("rejects invalid ports", () => {
    expect(() => buildServerConfig({ POLITY_SERVER_PORT: "not-a-port" })).toThrow("POLITY_SERVER_PORT");
  });
});
