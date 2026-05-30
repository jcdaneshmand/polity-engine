import { useMemo, useState } from "react";
import { Client } from "boardgame.io/react";
import { PrototypeGame } from "../../engine/src/game/game";
import Board from "./Board";
import PrivateCardEntry from "./ui/privateData/PrivateCardEntry";
import NewGameSetup, { type NewGameSessionConfig } from "./ui/setup/NewGameSetup";

type GameSession = NewGameSessionConfig & {
  id: number;
};

export default function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [homeView, setHomeView] = useState<"setup" | "private-data">("setup");

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

    return Client({
      game: configuredGame as typeof PrototypeGame & { setup: NonNullable<typeof PrototypeGame.setup> },
      board: Board,
      numPlayers: session.options.playerCount,
      debug: false
    });
  }, [session]);

  if (!session || !GameClient) {
    if (homeView === "private-data") {
      return <PrivateCardEntry onBack={() => setHomeView("setup")} />;
    }

    return (
      <div className="app-home">
        <div className="app-home-bar">
          <strong>Polity Engine</strong>
          <button type="button" onClick={() => setHomeView("private-data")}>
            Private Data
          </button>
        </div>
        <NewGameSetup onStart={(config) => setSession({ ...config, id: Date.now() })} />
      </div>
    );
  }

  return (
    <div className="game-shell">
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
        <button type="button" onClick={() => { setSession(null); setHomeView("private-data"); }}>
          Private Data
        </button>
      </div>
      <GameClient key={session.id} />
    </div>
  );
}
