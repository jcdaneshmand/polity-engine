import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App, { loadOnlineDirectory } from "./App";

describe("App shell", () => {
  it("renders a stable default theme hook on the home shell", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-theme="default"');
    expect(html).toContain("Online Games");
  });

  it("loads listed games even when chat is not available from the server", async () => {
    const lobbies = [{ lobbyID: "lobby-1" }];
    const matches = [{ matchID: "match-1" }];

    await expect(loadOnlineDirectory({
      listLobbies: async () => lobbies as any,
      listMatches: async () => matches as any,
      listChat: async () => {
        throw new Error("Online lobby is not available from this app server.");
      }
    })).resolves.toEqual({
      lobbies,
      matches,
      chatMessages: [],
      chatUnavailable: true
    });
  });
});
