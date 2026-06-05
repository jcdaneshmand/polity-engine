import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AccountPublicView } from "../../accountSession";
import AccountPanel from "./AccountPanel";

const account: AccountPublicView = {
  id: "account-1",
  email: "jonah@example.com",
  username: "Jonah",
  role: "player",
  createdAt: "2026-06-05T12:00:00.000Z",
  updatedAt: "2026-06-05T12:00:00.000Z",
  stats: {
    solo: {
      standard: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 },
      campaign: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0, campaignsStarted: 0, campaignsCompleted: 0 },
      practice: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 }
    },
    online: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 },
    byNation: {}
  }
};

describe("AccountPanel", () => {
  it("renders create and sign-in controls for guests", () => {
    const html = renderToStaticMarkup(
      <AccountPanel
        account={undefined}
        statusMessage=""
        onRegister={() => undefined}
        onSignIn={() => undefined}
        onSignOut={() => undefined}
      />
    );

    expect(html).toContain("Account");
    expect(html).toContain("Email");
    expect(html).toContain("Username");
    expect(html).toContain("Password");
    expect(html).toContain("Create Account");
    expect(html).toContain("Sign In");
  });

  it("renders signed-in player state", () => {
    const html = renderToStaticMarkup(
      <AccountPanel
        account={account}
        statusMessage=""
        onRegister={() => undefined}
        onSignIn={() => undefined}
        onSignOut={() => undefined}
      />
    );

    expect(html).toContain("Jonah");
    expect(html).toContain("player");
    expect(html).toContain("Sign Out");
    expect(html).not.toContain("Create Account");
  });

  it("marks admin accounts", () => {
    const html = renderToStaticMarkup(
      <AccountPanel
        account={{ ...account, role: "admin" }}
        statusMessage=""
        onRegister={() => undefined}
        onSignIn={() => undefined}
        onSignOut={() => undefined}
      />
    );

    expect(html).toContain("admin");
  });
});
