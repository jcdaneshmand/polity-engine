import { useMemo, useState } from "react";
import { Client } from "boardgame.io/react";
import { SocketIO } from "boardgame.io/multiplayer";
import { PrototypeGame } from "../../engine/src/game/game";
import type { CampaignProgress } from "../../engine/src/options/gameOptions";
import AboutPage from "./AboutPage";
import Board from "./Board";
import PrivateCardEntry from "./ui/privateData/PrivateCardEntry";
import NewGameSetup, { type NewGameSessionConfig } from "./ui/setup/NewGameSetup";
import { createOnlineMatch, joinOnlineMatch, ONLINE_SESSION_STORAGE_KEY, parseOnlineSessionRecord, resolveMultiplayerServerURL, serializeOnlineSessionRecord, type OnlineSessionRecord } from "./onlineSession";

type GameSession = NewGameSessionConfig & {
  id: number;
} & (
  | { kind: "local" }
  | { kind: "online"; matchID: string; playerID: string; credentials: string; serverURL: string }
);

function loadOnlineSessionRecord(): OnlineSessionRecord | undefined {
  if (typeof window === "undefined") return undefined;
  return parseOnlineSessionRecord(window.localStorage.getItem(ONLINE_SESSION_STORAGE_KEY));
}

function saveOnlineSessionRecord(record: OnlineSessionRecord): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONLINE_SESSION_STORAGE_KEY, serializeOnlineSessionRecord(record));
}

export default function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [homeView, setHomeView] = useState<"setup" | "private-data" | "about">("setup");
  const [pendingCampaignProgress, setPendingCampaignProgress] = useState<CampaignProgress | undefined>(undefined);
  const [savedOnlineSession, setSavedOnlineSession] = useState<OnlineSessionRecord | undefined>(loadOnlineSessionRecord());
  const [onlineStatus, setOnlineStatus] = useState("");
  const multiplayerServerURL = resolveMultiplayerServerURL({
    configuredURL: typeof import.meta.env.VITE_MULTIPLAYER_SERVER_URL === "string" ? import.meta.env.VITE_MULTIPLAYER_SERVER_URL : undefined,
    windowOrigin: typeof window === "undefined" ? undefined : window.location.origin
  });

  const GameClient = useMemo(() => {
    if (!session) return null;
    const configuredGame = session.kind === "local"
      ? {
        ...PrototypeGame,
        setup: (ctx: Parameters<NonNullable<typeof PrototypeGame.setup>>[0]) =>
          PrototypeGame.setup!(ctx, {
            options: session.options,
            playerNationIds: session.playerNationIds,
            soloBotNationId: session.soloBotNationId,
            privateData: session.privateData,
            randomSeed: String(session.id)
          })
      }
      : PrototypeGame;

    const SessionBoard = (props: Parameters<typeof Board>[0]) => <Board
      {...props}
      onCampaignProgress={(campaignProgress: CampaignProgress) => {
        setPendingCampaignProgress(campaignProgress);
        setSession(null);
        setHomeView("setup");
      }}
    />;

    return Client({
      game: configuredGame as typeof PrototypeGame & { setup: NonNullable<typeof PrototypeGame.setup> },
      board: SessionBoard,
      numPlayers: session.options.playerCount,
      debug: false,
      ...(session.kind === "online" ? {
        multiplayer: SocketIO({ server: session.serverURL }),
        matchID: session.matchID,
        playerID: session.playerID,
        credentials: session.credentials
      } : {})
    });
  }, [session]);

  const startLocalGame = (config: NewGameSessionConfig) => {
    setPendingCampaignProgress(undefined);
    setOnlineStatus("");
    setSession({ ...config, id: Date.now(), kind: "local" });
  };

  const startOnlineSession = (config: NewGameSessionConfig, record: OnlineSessionRecord) => {
    saveOnlineSessionRecord(record);
    setSavedOnlineSession(record);
    setPendingCampaignProgress(undefined);
    setOnlineStatus(`Online room ${record.matchID} as Player ${Number(record.playerID) + 1}`);
    setSession({
      ...config,
      id: Date.now(),
      kind: "online",
      matchID: record.matchID,
      playerID: record.playerID,
      credentials: record.credentials,
      serverURL: record.serverURL
    });
  };

  const hostOnlineGame = async (config: NewGameSessionConfig, serverURL: string) => {
    setOnlineStatus("Creating online game...");
    try {
      const created = await createOnlineMatch({ serverURL, numPlayers: config.options.playerCount, setupData: config });
      const joined = await joinOnlineMatch({ serverURL, matchID: created.matchID, playerID: "0", playerName: "Host" });
      startOnlineSession(config, {
        matchID: created.matchID,
        playerID: "0",
        credentials: joined.playerCredentials,
        serverURL,
        numPlayers: config.options.playerCount,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not create online game.");
    }
  };

  const joinOnlineGame = async (args: { config: NewGameSessionConfig; matchID: string; playerID: string; playerName: string; serverURL: string }) => {
    setOnlineStatus("Joining online game...");
    try {
      const joined = await joinOnlineMatch(args);
      startOnlineSession(args.config, {
        matchID: args.matchID,
        playerID: args.playerID,
        credentials: joined.playerCredentials,
        serverURL: args.serverURL,
        numPlayers: args.config.options.playerCount,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not join online game.");
    }
  };

  const rejoinOnlineGame = () => {
    if (!savedOnlineSession) return;
    setOnlineStatus(`Rejoining online room ${savedOnlineSession.matchID}`);
    setSession({
      id: Date.now(),
      kind: "online",
      matchID: savedOnlineSession.matchID,
      playerID: savedOnlineSession.playerID,
      credentials: savedOnlineSession.credentials,
      serverURL: savedOnlineSession.serverURL,
      options: {
        playerCount: savedOnlineSession.numPlayers as 1 | 2 | 3 | 4,
        mode: "multiplayer",
        enabledExpansions: [],
        enabledVariants: []
      },
      playerNationIds: {}
    });
  };

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
          initialCampaignProgress={pendingCampaignProgress}
          onStart={startLocalGame}
          onHostOnline={hostOnlineGame}
          onJoinOnline={joinOnlineGame}
          onRejoinOnline={rejoinOnlineGame}
          canRejoinOnline={!!savedOnlineSession}
          onlineServerURL={multiplayerServerURL}
          onOpenCardEntry={() => setHomeView("private-data")}
        />
        {onlineStatus ? <p className="setup-help">{onlineStatus}</p> : null}
      </div>
    );
  }

  return (
    <div className="game-shell" data-theme="default">
      <div className="game-shell-bar">
        <div>
          <strong>Polity Engine</strong>
          <span>
            {session.kind === "online"
              ? `online room ${session.matchID} / Player ${Number(session.playerID) + 1}`
              : `${session.options.mode} / ${session.options.playerCount} player${session.options.playerCount === 1 ? "" : "s"}`}
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
