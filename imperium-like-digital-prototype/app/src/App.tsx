import { useMemo, useState } from "react";
import { Client } from "boardgame.io/react";
import { SocketIO } from "boardgame.io/multiplayer";
import { PrototypeGame } from "../../engine/src/game/game";
import type { CampaignProgress } from "../../engine/src/options/gameOptions";
import AboutPage from "./AboutPage";
import Board from "./Board";
import { computePrivateDataFingerprint, createLobbyRoom, joinLobbyRoom, joinPolityOnlineMatch, leavePolityOnlineMatch, listLobbyChat, listLobbyRooms, listOnlineChat, listOnlineMatches, ONLINE_SESSION_STORAGE_KEY, parseOnlineSessionRecord, rejoinLobbyRoom, resolveMultiplayerServerURL, selectLobbyNation, sendLobbyChat, sendOnlineChat, serializeOnlineSessionRecord, setLobbyReady, spectateOnlineMatch, startLobbyGame, updateLobbySetup, type ChatMessage, type ListedLobby, type ListedMatch, type LobbyRoomDetails, type OnlineLobbySessionRecord, type OnlineSessionRecord, type OnlineStartedSessionRecord } from "./onlineSession";
import PrivateCardEntry from "./ui/privateData/PrivateCardEntry";
import LobbyRoom from "./ui/online/LobbyRoom";
import OnlineGames from "./ui/online/OnlineGames";
import NewGameSetup, { type NewGameSessionConfig } from "./ui/setup/NewGameSetup";

type GameSession = NewGameSessionConfig & {
  id: number;
} & (
  | { kind: "local" }
  | { kind: "online"; role: "player"; matchID: string; playerID: string; credentials: string; serverURL: string }
  | { kind: "online"; role: "spectator"; matchID: string; credentials: string; serverURL: string }
);

export async function loadOnlineDirectory(args: {
  listLobbies: () => Promise<ListedLobby[]>;
  listMatches: () => Promise<ListedMatch[]>;
  listChat: () => Promise<ChatMessage[]>;
}): Promise<{ lobbies: ListedLobby[]; matches: ListedMatch[]; chatMessages: ChatMessage[]; chatUnavailable: boolean }> {
  const [lobbies, matches] = await Promise.all([args.listLobbies(), args.listMatches()]);
  try {
    return {
      lobbies,
      matches,
      chatMessages: await args.listChat(),
      chatUnavailable: false
    };
  } catch {
    return {
      lobbies,
      matches,
      chatMessages: [],
      chatUnavailable: true
    };
  }
}

function loadOnlineSessionRecord(): OnlineSessionRecord | undefined {
  if (typeof window === "undefined") return undefined;
  return parseOnlineSessionRecord(window.localStorage.getItem(ONLINE_SESSION_STORAGE_KEY));
}

function saveOnlineSessionRecord(record: OnlineSessionRecord): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONLINE_SESSION_STORAGE_KEY, serializeOnlineSessionRecord(record));
}

function isLobbySessionRecord(record: OnlineSessionRecord | undefined): record is OnlineLobbySessionRecord {
  return record?.kind === "lobby";
}

function isStartedSessionRecord(record: OnlineSessionRecord | undefined): record is OnlineStartedSessionRecord {
  return Boolean(record && record.kind !== "lobby");
}

export default function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [homeView, setHomeView] = useState<"setup" | "private-data" | "about" | "online" | "lobby" | "lobby-setup">("setup");
  const [pendingCampaignProgress, setPendingCampaignProgress] = useState<CampaignProgress | undefined>(undefined);
  const [savedOnlineSession, setSavedOnlineSession] = useState<OnlineSessionRecord | undefined>(loadOnlineSessionRecord());
  const [onlineSetupConfig, setOnlineSetupConfig] = useState<NewGameSessionConfig | undefined>(undefined);
  const [onlinePlayerName, setOnlinePlayerName] = useState("Player");
  const [listedLobbies, setListedLobbies] = useState<ListedLobby[]>([]);
  const [listedMatches, setListedMatches] = useState<ListedMatch[]>([]);
  const [onlineChatMessages, setOnlineChatMessages] = useState<ChatMessage[]>([]);
  const [lobbyChatMessages, setLobbyChatMessages] = useState<ChatMessage[]>([]);
  const [currentLobby, setCurrentLobby] = useState<LobbyRoomDetails | undefined>(undefined);
  const [currentLobbySession, setCurrentLobbySession] = useState<OnlineLobbySessionRecord | undefined>(isLobbySessionRecord(savedOnlineSession) ? savedOnlineSession : undefined);
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

    const SessionBoard = (props: Parameters<typeof Board>[0]) => {
      const boardProps = session.kind === "online" && session.role === "spectator"
        ? { ...props, moves: {}, events: {} }
        : props;
      return <Board
        {...boardProps}
        onCampaignProgress={(campaignProgress: CampaignProgress) => {
          setPendingCampaignProgress(campaignProgress);
          setSession(null);
          setHomeView("setup");
        }}
      />;
    };

    return Client({
      game: configuredGame as typeof PrototypeGame & { setup: NonNullable<typeof PrototypeGame.setup> },
      board: SessionBoard,
      numPlayers: session.options.playerCount,
      debug: false,
      ...(session.kind === "online" ? {
        multiplayer: SocketIO({ server: session.serverURL }),
        matchID: session.matchID,
        ...(session.role === "player" ? { playerID: session.playerID } : {}),
        credentials: session.credentials
      } : {})
    });
  }, [session]);

  const startLocalGame = (config: NewGameSessionConfig) => {
    setPendingCampaignProgress(undefined);
    setOnlineStatus("");
    setSession({ ...config, id: Date.now(), kind: "local" });
  };

  const startOnlineSession = (config: NewGameSessionConfig, record: OnlineStartedSessionRecord) => {
    saveOnlineSessionRecord(record);
    setSavedOnlineSession(record);
    setPendingCampaignProgress(undefined);
    setOnlineStatus(record.kind === "spectator" ? `Spectating online room ${record.matchID}` : `Online room ${record.matchID} as Player ${Number(record.playerID) + 1}`);
    if (record.kind === "spectator") {
      setSession({
        ...config,
        id: Date.now(),
        kind: "online",
        role: "spectator",
        matchID: record.matchID,
        credentials: record.credentials,
        serverURL: record.serverURL
      });
      return;
    }
    setSession({
      ...config,
      id: Date.now(),
      kind: "online",
      role: "player",
      matchID: record.matchID,
      playerID: record.playerID ?? "0",
      credentials: record.credentials,
      serverURL: record.serverURL
    });
  };

  const rejoinOnlineGame = async () => {
    if (!savedOnlineSession) return;
    if (isLobbySessionRecord(savedOnlineSession)) {
      setOnlineStatus(`Rejoining lobby ${savedOnlineSession.lobbyID}`);
      try {
        const rejoined = await rejoinLobbyRoom({
          serverURL: savedOnlineSession.serverURL,
          lobbyID: savedOnlineSession.lobbyID,
          lobbyCredentials: savedOnlineSession.lobbyCredentials
        });
        const chatMessages = await listLobbyChat({
          serverURL: savedOnlineSession.serverURL,
          lobbyID: savedOnlineSession.lobbyID,
          lobbyCredentials: savedOnlineSession.lobbyCredentials
        });
        setCurrentLobbySession(savedOnlineSession);
        setCurrentLobby(rejoined.lobby);
        setLobbyChatMessages(chatMessages);
        setHomeView("lobby");
      } catch (error) {
        setOnlineStatus(error instanceof Error ? error.message : "Could not rejoin lobby.");
      }
      return;
    }
    setOnlineStatus(`Rejoining online room ${savedOnlineSession.matchID}`);
    const rejoinOptions = {
      playerCount: savedOnlineSession.numPlayers as 1 | 2 | 3 | 4,
      mode: "multiplayer" as const,
      enabledExpansions: [],
      enabledVariants: []
    };
    if (savedOnlineSession.kind === "spectator") {
      setSession({
        id: Date.now(),
        kind: "online",
        role: "spectator",
        matchID: savedOnlineSession.matchID,
        credentials: savedOnlineSession.credentials,
        serverURL: savedOnlineSession.serverURL,
        options: rejoinOptions,
        playerNationIds: {}
      });
      return;
    }
    setSession({
      id: Date.now(),
      kind: "online",
      role: "player",
      matchID: savedOnlineSession.matchID,
      credentials: savedOnlineSession.credentials,
      serverURL: savedOnlineSession.serverURL,
      playerID: savedOnlineSession.playerID ?? "0",
      options: rejoinOptions,
      playerNationIds: {}
    });
  };

  const refreshOnlineMatches = async () => {
    setOnlineStatus("Refreshing online games...");
    try {
      const { lobbies, matches, chatMessages, chatUnavailable } = await loadOnlineDirectory({
        listLobbies: () => listLobbyRooms({ serverURL: multiplayerServerURL }),
        listMatches: () => listOnlineMatches({ serverURL: multiplayerServerURL }),
        listChat: () => listOnlineChat({ serverURL: multiplayerServerURL })
      });
      setListedLobbies(lobbies);
      setListedMatches(matches);
      setOnlineChatMessages(chatMessages);
      const total = lobbies.length + matches.length;
      const roomStatus = total ? `Loaded ${total} online room${total === 1 ? "" : "s"}.` : "No online games are listed yet.";
      setOnlineStatus(chatUnavailable ? `${roomStatus} Chat is unavailable from this server.` : roomStatus);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not load online games.");
    }
  };

  const openOnlineGames = (config: NewGameSessionConfig, playerName: string) => {
    setOnlineSetupConfig(config);
    setOnlinePlayerName(playerName.trim() || "Player");
    setHomeView("online");
    void refreshOnlineMatches();
  };

  const currentOnlineConfig = onlineSetupConfig ?? {
    options: {
      playerCount: 2 as const,
      mode: "multiplayer" as const,
      enabledExpansions: [],
      enabledVariants: []
    },
    playerNationIds: {}
  };

  const currentPrivateDataFingerprint = computePrivateDataFingerprint(currentOnlineConfig.privateData);

  const hostOnlineGame = async (args: { roomName: string; playerName: string; password?: string; setupConfig: NewGameSessionConfig; privateDataFingerprint: string }) => {
    setOnlineStatus("Creating lobby...");
    try {
      const created = await createLobbyRoom({
        serverURL: multiplayerServerURL,
        roomName: args.roomName,
        playerCount: args.setupConfig.options.playerCount,
        setupData: args.setupConfig,
        privateDataFingerprint: args.privateDataFingerprint,
        password: args.password,
        hostName: args.playerName
      });
      const record: OnlineLobbySessionRecord = {
        kind: "lobby",
        lobbyID: created.lobbyID,
        seatID: created.seatID,
        lobbyCredentials: created.lobbyCredentials,
        serverURL: multiplayerServerURL,
        savedAt: new Date().toISOString()
      };
      saveOnlineSessionRecord(record);
      setSavedOnlineSession(record);
      setCurrentLobbySession(record);
      setCurrentLobby(created.lobby);
      setLobbyChatMessages([]);
      setOnlineSetupConfig(args.setupConfig);
      setHomeView("lobby");
      setOnlineStatus(`Lobby ${created.lobbyID} created.`);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not create lobby.");
    }
  };

  const currentLobbySetupConfig = currentLobby?.setupData && typeof currentLobby.setupData === "object"
    ? currentLobby.setupData as NewGameSessionConfig
    : currentOnlineConfig;

  const joinOnlineLobby = async (args: { lobbyID: string; playerName: string; password?: string; privateDataFingerprint: string }) => {
    setOnlineStatus("Joining lobby...");
    try {
      const joined = await joinLobbyRoom({
        serverURL: multiplayerServerURL,
        lobbyID: args.lobbyID,
        displayName: args.playerName,
        password: args.password,
        privateDataFingerprint: args.privateDataFingerprint
      });
      const record: OnlineLobbySessionRecord = {
        kind: "lobby",
        lobbyID: joined.lobbyID,
        seatID: joined.seatID,
        lobbyCredentials: joined.lobbyCredentials,
        serverURL: multiplayerServerURL,
        savedAt: new Date().toISOString()
      };
      saveOnlineSessionRecord(record);
      setSavedOnlineSession(record);
      setCurrentLobbySession(record);
      setCurrentLobby(joined.lobby);
      setLobbyChatMessages([]);
      setHomeView("lobby");
      setOnlineStatus(`Joined lobby ${joined.lobbyID}.`);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not join lobby.");
    }
  };

  const joinOnlineGame = async (args: { matchID: string; playerID?: string; playerName: string; password?: string; privateDataFingerprint: string; setupConfig: NewGameSessionConfig }) => {
    setOnlineStatus("Joining online game...");
    try {
      const joined = await joinPolityOnlineMatch({ serverURL: multiplayerServerURL, ...args });
      const playerID = joined.playerID ?? args.playerID ?? "0";
      startOnlineSession(args.setupConfig, {
        kind: "player",
        matchID: args.matchID,
        playerID,
        credentials: joined.playerCredentials,
        serverURL: multiplayerServerURL,
        numPlayers: joined.match?.playerCount ?? args.setupConfig.options.playerCount,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not join online game.");
    }
  };

  const spectateOnlineGame = async (args: { matchID: string; password?: string; privateDataFingerprint: string }) => {
    setOnlineStatus("Joining as spectator...");
    try {
      const watched = await spectateOnlineMatch({ serverURL: multiplayerServerURL, ...args });
      startOnlineSession(currentOnlineConfig, {
        kind: "spectator",
        matchID: args.matchID,
        credentials: watched.spectatorCredentials,
        serverURL: multiplayerServerURL,
        numPlayers: watched.match?.playerCount ?? currentOnlineConfig.options.playerCount,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not spectate online game.");
    }
  };

  const refreshCurrentLobby = async () => {
    if (!currentLobbySession) return;
    try {
      const rejoined = await rejoinLobbyRoom({
        serverURL: multiplayerServerURL,
        lobbyID: currentLobbySession.lobbyID,
        lobbyCredentials: currentLobbySession.lobbyCredentials
      });
      const chatMessages = await listLobbyChat({
        serverURL: multiplayerServerURL,
        lobbyID: currentLobbySession.lobbyID,
        lobbyCredentials: currentLobbySession.lobbyCredentials
      });
      setCurrentLobby(rejoined.lobby);
      setLobbyChatMessages(chatMessages);
      setOnlineStatus(`Lobby ${currentLobbySession.lobbyID} refreshed.`);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not refresh lobby.");
    }
  };

  const updateCurrentLobbySetup = async (args: { roomName: string; setupConfig: NewGameSessionConfig }) => {
    if (!currentLobbySession) return;
    try {
      const updated = await updateLobbySetup({
        serverURL: multiplayerServerURL,
        lobbyID: currentLobbySession.lobbyID,
        lobbyCredentials: currentLobbySession.lobbyCredentials,
        roomName: args.roomName,
        playerCount: args.setupConfig.options.playerCount,
        setupData: args.setupConfig,
        privateDataFingerprint: computePrivateDataFingerprint(args.setupConfig.privateData)
      });
      if (updated.lobby) setCurrentLobby(updated.lobby);
      setOnlineSetupConfig(args.setupConfig);
      setHomeView("lobby");
      setOnlineStatus("Setup updated; players need to ready again.");
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not update setup.");
    }
  };

  const selectCurrentLobbyNation = async (nationID: string) => {
    if (!currentLobbySession) return;
    try {
      const updated = await selectLobbyNation({
        serverURL: multiplayerServerURL,
        lobbyID: currentLobbySession.lobbyID,
        lobbyCredentials: currentLobbySession.lobbyCredentials,
        nationID
      });
      if (updated.lobby) setCurrentLobby(updated.lobby);
      setOnlineStatus("Nation selected.");
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not select nation.");
    }
  };

  const setCurrentLobbyReady = async (ready: boolean) => {
    if (!currentLobbySession) return;
    try {
      const updated = await setLobbyReady({
        serverURL: multiplayerServerURL,
        lobbyID: currentLobbySession.lobbyID,
        lobbyCredentials: currentLobbySession.lobbyCredentials,
        ready
      });
      if (updated.lobby) setCurrentLobby(updated.lobby);
      setOnlineStatus(ready ? "Ready." : "Setup unlocked.");
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not update ready state.");
    }
  };

  const sendOnlineLoungeMessage = async (text: string) => {
    try {
      const sent = await sendOnlineChat({ serverURL: multiplayerServerURL, author: onlinePlayerName, text });
      setOnlineChatMessages((current) => [...current, sent.message]);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not send chat message.");
    }
  };

  const sendCurrentLobbyMessage = async (text: string) => {
    if (!currentLobbySession) return;
    try {
      const sent = await sendLobbyChat({
        serverURL: multiplayerServerURL,
        lobbyID: currentLobbySession.lobbyID,
        lobbyCredentials: currentLobbySession.lobbyCredentials,
        text
      });
      setLobbyChatMessages((current) => [...current, sent.message]);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not send chat message.");
    }
  };

  const startCurrentLobbyGame = async () => {
    if (!currentLobbySession || !currentLobby) return;
    try {
      const started = await startLobbyGame({
        serverURL: multiplayerServerURL,
        lobbyID: currentLobbySession.lobbyID,
        lobbyCredentials: currentLobbySession.lobbyCredentials
      });
      startOnlineSession(currentLobbySetupConfig, {
        kind: "player",
        matchID: started.matchID,
        playerID: started.playerID,
        credentials: started.playerCredentials,
        serverURL: multiplayerServerURL,
        numPlayers: currentLobby.playerCount,
        savedAt: new Date().toISOString()
      });
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not start game.");
    }
  };

  const forgetOnlineSession = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(ONLINE_SESSION_STORAGE_KEY);
    setSavedOnlineSession(undefined);
    setCurrentLobbySession(undefined);
    setCurrentLobby(undefined);
  };

  const leaveCurrentGame = () => {
    if (session?.kind === "online" && session.role === "player") {
      void leavePolityOnlineMatch({
        serverURL: session.serverURL,
        matchID: session.matchID,
        playerID: session.playerID
      }).catch(() => undefined);
      if (savedOnlineSession?.kind !== "lobby" && savedOnlineSession?.matchID === session.matchID) {
        if (typeof window !== "undefined") window.localStorage.removeItem(ONLINE_SESSION_STORAGE_KEY);
        setSavedOnlineSession(undefined);
      }
    }
    setSession(null);
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

    if (homeView === "lobby" && currentLobby) {
      return (
        <div className="app-home" data-theme="default">
          <LobbyRoom
            lobby={currentLobby}
            setupConfig={currentLobbySetupConfig}
            chatMessages={lobbyChatMessages}
            statusMessage={onlineStatus}
            onBack={() => {
              setHomeView("online");
              void refreshOnlineMatches();
            }}
            onRefresh={refreshCurrentLobby}
            onEditSetup={() => setHomeView("lobby-setup")}
            onSelectNation={selectCurrentLobbyNation}
            onReady={setCurrentLobbyReady}
            onStart={startCurrentLobbyGame}
            onSendChat={sendCurrentLobbyMessage}
          />
        </div>
      );
    }

    if (homeView === "lobby-setup" && currentLobby) {
      return (
        <div className="app-home" data-theme="default">
          <NewGameSetup
            initialConfig={currentLobbySetupConfig}
            title="Lobby Setup"
            kicker="Pregame lobby"
            submitLabel="Update Lobby"
            onlineGamesEnabled={false}
            allowedModes={["multiplayer"]}
            onCancel={() => setHomeView("lobby")}
            onStart={(setupConfig) => void updateCurrentLobbySetup({ roomName: currentLobby.roomName, setupConfig })}
            onOpenCardEntry={() => setHomeView("private-data")}
          />
          {onlineStatus ? <p className="setup-help">{onlineStatus}</p> : null}
        </div>
      );
    }

    if (homeView === "online") {
      return (
        <div className="app-home" data-theme="default">
          <OnlineGames
            setupConfig={currentOnlineConfig}
            initialPlayerName={onlinePlayerName}
            privateDataFingerprint={currentPrivateDataFingerprint}
            savedSessions={savedOnlineSession ? [savedOnlineSession] : []}
            lobbies={listedLobbies}
            matches={listedMatches}
            chatMessages={onlineChatMessages}
            statusMessage={onlineStatus}
            onBackToSetup={() => setHomeView("setup")}
            onRefresh={refreshOnlineMatches}
            onHost={hostOnlineGame}
            onJoinLobby={joinOnlineLobby}
            onJoin={joinOnlineGame}
            onSpectate={spectateOnlineGame}
            onRejoin={() => void rejoinOnlineGame()}
            onForgetSession={() => forgetOnlineSession()}
            onSendChat={sendOnlineLoungeMessage}
          />
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
          onOpenOnlineGames={openOnlineGames}
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
              ? session.role === "spectator"
                ? `online room ${session.matchID} / Spectator`
                : `online room ${session.matchID} / Player ${Number(session.playerID) + 1}`
              : `${session.options.mode} / ${session.options.playerCount} player${session.options.playerCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <button type="button" onClick={leaveCurrentGame}>
          New Game
        </button>
      </div>
      <GameClient key={session.id} />
    </div>
  );
}
