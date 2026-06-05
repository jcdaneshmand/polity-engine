import { useMemo, useState } from "react";
import { Client } from "boardgame.io/react";
import { PrototypeGame } from "../../engine/src/game/game";
import type { CampaignProgress } from "../../engine/src/options/gameOptions";
import AboutPage from "./AboutPage";
import Board from "./Board";
import PrivateCardEntry from "./ui/privateData/PrivateCardEntry";
import NewGameSetup, { type NewGameSessionConfig } from "./ui/setup/NewGameSetup";

type GameSession = NewGameSessionConfig & {
  id: number;
};

export default function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [homeView, setHomeView] = useState<"setup" | "private-data" | "about">("setup");

  const GameClient = useMemo(() => {
    if (!session) return null;
    const configuredGame = {
      ...PrototypeGame,
      setup: (ctx: Parameters<NonNullable<typeof PrototypeGame.setup>>[0]) =>
        PrototypeGame.setup!(ctx, {
          options: session.options,
          playerNationIds: session.playerNationIds,
          soloBotNationId: session.soloBotNationId,
          privateData: session.privateData,
          randomSeed: String(session.id)
        })
    };

    const SessionBoard = (props: Parameters<typeof Board>[0]) => <Board
      {...props}
      onCampaignProgress={(campaignProgress: CampaignProgress) => setSession((current) => current
        ? { ...current, options: { ...current.options, campaignProgress, campaignMode: campaignProgress.mode } }
        : current
      )}
    />;

    return Client({
      game: configuredGame as typeof PrototypeGame & { setup: NonNullable<typeof PrototypeGame.setup> },
      board: SessionBoard,
      numPlayers: session.options.playerCount,
      debug: false
    });
  }, [session]);

  if (!session || !GameClient) {
    if (homeView === "private-data") {
      return <div className="app-home" data-theme="default"><PrivateCardEntry onBack={() => setHomeView("setup")} /></div>;
    }

    if (homeView === "about") {
      return (
        <div className="app-home" data-theme="default">
          <div className="app-home-bar">
            <strong>Polity Engine</strong>
            <button type="button" onClick={() => setHomeView("setup")}>
              Setup
            </button>
          </div>
          <AboutPage onBack={() => setHomeView("setup")} />
        </div>
      );
    }

    return (
      <div className="app-home" data-theme="default">
        <div className="app-home-bar">
          <strong>Polity Engine</strong>
          <button type="button" onClick={() => setHomeView("about")}>
            About
          </button>
        </div>
        <NewGameSetup
          onStart={(config) => setSession({ ...config, id: Date.now() })}
          onOpenCardEntry={() => setHomeView("private-data")}
        />
      </div>
    );
  }

  return (
    <div className="game-shell" data-theme="default">
      <div className="game-shell-bar">
        <div>
          <strong>Polity Engine</strong>
          <span>
            {session.options.mode} / {session.options.playerCount} player{session.options.playerCount === 1 ? "" : "s"}
          </span>
        </div>
        <button type="button" onClick={() => setSession(null)}>
          New Game
        </button>
      </div>
      <GameClient key={session.id} />
    </div>
  );
}
