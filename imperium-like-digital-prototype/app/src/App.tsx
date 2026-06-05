import { useEffect, useMemo, useState } from "react";
import { Client } from "boardgame.io/react";
import { SocketIO } from "boardgame.io/multiplayer";
import { PrototypeGame } from "../../engine/src/game/game";
import type { CampaignProgress } from "../../engine/src/options/gameOptions";
import { ACCOUNT_SESSION_STORAGE_KEY, parseAccountSessionRecord, serializeAccountSessionRecord, type AccountSessionRecord } from "./accountSession";
import AboutPage from "./AboutPage";
import Board from "./Board";
import { changeAccountPassword, clearAllOnlineGames, closePolityOnlineMatch, completePasswordReset, computePrivateDataFingerprint, createLobbyRoom, heartbeatLobbyRoom, heartbeatPolityOnlineMatch, joinLobbyRoom, joinPolityOnlineMatch, leaveLobbyRoom, leavePolityOnlineMatch, listLobbyChat, listLobbyRooms, listOnlineChat, listOnlineMatches, loadCurrentAccount, ONLINE_SESSION_STORAGE_KEY, parseOnlineSessionRecord, recordAccountGameResult, registerAccount, rejoinLobbyRoom, requestPasswordReset, resolveMultiplayerServerURL, selectLobbyNation, sendLobbyChat, sendOnlineChat, serializeOnlineSessionRecord, setLobbyReady, signInAccount, signOutAccount, spectateOnlineMatch, startAccountGameHistory, startLobbyGame, updateLobbySetup, type AccountGameResultInput, type AccountHistoryStartInput, type ChatMessage, type ListedLobby, type ListedMatch, type LobbyRoomDetails, type OnlineLobbySessionRecord, type OnlineSessionRecord, type OnlineStartedSessionRecord } from "./onlineSession";
import PrivateCardEntry from "./ui/privateData/PrivateCardEntry";
import LobbyRoom from "./ui/online/LobbyRoom";
import OnlineGames from "./ui/online/OnlineGames";
import NewGameSetup, { type NewGameSessionConfig } from "./ui/setup/NewGameSetup";

type AccountGameTracking = {
  accountHistoryEntryID?: string;
  accountScope?: "solo" | "online";
  accountVariant?: "standard" | "campaign" | "practice" | "multiplayer";
  accountPlayerID?: string;
};

type GameSession = NewGameSessionConfig & AccountGameTracking & {
  id: number;
} & (
  | { kind: "local" }
  | { kind: "online"; role: "player"; matchID: string; playerID: string; credentials: string; serverURL: string }
  | { kind: "online"; role: "spectator"; matchID: string; credentials: string; serverURL: string }
);

const ONLINE_CLIENT_STORAGE_KEY = "polity-engine.onlineClientID.v1";
const ONLINE_HEARTBEAT_MS = 5_000;

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

function loadAccountSessionRecord(): AccountSessionRecord | undefined {
  if (typeof window === "undefined") return undefined;
  return parseAccountSessionRecord(window.localStorage.getItem(ACCOUNT_SESSION_STORAGE_KEY));
}

function saveAccountSessionRecord(record: AccountSessionRecord): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCOUNT_SESSION_STORAGE_KEY, serializeAccountSessionRecord(record));
}

function clearAccountSessionRecord(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCOUNT_SESSION_STORAGE_KEY);
}

function loadOnlineClientID(): string {
  if (typeof window === "undefined") return "server-render-client";
  const existing = window.localStorage.getItem(ONLINE_CLIENT_STORAGE_KEY);
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.() ?? `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(ONLINE_CLIENT_STORAGE_KEY, next);
  return next;
}

function isLobbySessionRecord(record: OnlineSessionRecord | undefined): record is OnlineLobbySessionRecord {
  return record?.kind === "lobby";
}

function isStartedSessionRecord(record: OnlineSessionRecord | undefined): record is OnlineStartedSessionRecord {
  return Boolean(record && record.kind !== "lobby");
}

function createAccountHistoryID(scope: "solo" | "online"): string {
  return `${scope}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localAccountVariant(config: NewGameSessionConfig): "standard" | "campaign" | "practice" | undefined {
  if (config.options.mode === "practice") return "practice";
  if (config.options.mode === "solo") return config.options.campaignProgress ? "campaign" : "standard";
  return undefined;
}

function startAccountHistoryEntry(args: {
  serverURL: string;
  accountToken: string;
  entry: AccountHistoryStartInput;
  onError: (message: string) => void;
}): void {
  void startAccountGameHistory({
    serverURL: args.serverURL,
    accountToken: args.accountToken,
    entry: args.entry
  }).catch((error) => {
    args.onError(error instanceof Error ? error.message : "Could not save game history.");
  });
}

function resetTokenFromInput(input: string): string {
  const trimmed = input.trim();
  try {
    return new URL(trimmed).searchParams.get("token") || trimmed;
  } catch {
    return trimmed;
  }
}

export default function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [homeView, setHomeView] = useState<"setup" | "private-data" | "about" | "online" | "lobby" | "lobby-setup">("setup");
  const [pendingCampaignProgress, setPendingCampaignProgress] = useState<CampaignProgress | undefined>(undefined);
  const [savedOnlineSession, setSavedOnlineSession] = useState<OnlineSessionRecord | undefined>(loadOnlineSessionRecord());
  const [onlineSetupConfig, setOnlineSetupConfig] = useState<NewGameSessionConfig | undefined>(undefined);
  const [onlinePlayerName, setOnlinePlayerName] = useState("Player");
  const [accountSession, setAccountSession] = useState<AccountSessionRecord | undefined>(loadAccountSessionRecord());
  const [accountStatus, setAccountStatus] = useState("");
  const [onlineClientID] = useState<string>(loadOnlineClientID());
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
        viewerPlayerID={session.kind === "online" && session.role === "player" ? session.playerID : undefined}
        accountResultContext={session.accountHistoryEntryID && session.accountScope && session.accountVariant && session.accountPlayerID
          ? {
            historyEntryID: session.accountHistoryEntryID,
            scope: session.accountScope,
            variant: session.accountVariant,
            playerID: session.accountPlayerID
          }
          : undefined}
        onAccountGameResult={(result: AccountGameResultInput) => {
          if (!accountSession) return;
          void recordAccountGameResult({
            serverURL: multiplayerServerURL,
            accountToken: accountSession.token,
            result
          }).catch((error) => {
            setOnlineStatus(error instanceof Error ? error.message : "Could not save game result.");
          });
        }}
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
  }, [accountSession, multiplayerServerURL, session]);

  useEffect(() => {
    if (!accountSession) return;
    void loadCurrentAccount({ serverURL: multiplayerServerURL, accountToken: accountSession.token })
      .then(({ account }) => {
        const next = { token: accountSession.token, account };
        saveAccountSessionRecord(next);
        setAccountSession(next);
      })
      .catch(() => {
        clearAccountSessionRecord();
        setAccountSession(undefined);
        setAccountStatus("Signed out.");
      });
  }, [accountSession?.token, multiplayerServerURL]);

  useEffect(() => {
    if (homeView !== "lobby" || !currentLobbySession) return;
    const beat = () => {
      void heartbeatLobbyRoom({
        serverURL: currentLobbySession.serverURL,
        lobbyID: currentLobbySession.lobbyID,
        lobbyCredentials: currentLobbySession.lobbyCredentials
      }).catch(() => undefined);
    };
    beat();
    const id = window.setInterval(beat, ONLINE_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [currentLobbySession, homeView]);

  useEffect(() => {
    if (!session || session.kind !== "online" || session.role !== "player") return;
    const beat = () => {
      void heartbeatPolityOnlineMatch({
        serverURL: session.serverURL,
        matchID: session.matchID,
        playerID: session.playerID,
        clientID: onlineClientID
      }).catch(() => undefined);
    };
    beat();
    const id = window.setInterval(beat, ONLINE_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [onlineClientID, session]);

  const startLocalGame = (config: NewGameSessionConfig) => {
    setPendingCampaignProgress(undefined);
    setOnlineStatus("");
    const variant = localAccountVariant(config);
    const tracking = accountSession && variant
      ? {
        accountHistoryEntryID: createAccountHistoryID("solo"),
        accountScope: "solo" as const,
        accountVariant: variant,
        accountPlayerID: "0"
      }
      : {};
    if (accountSession && tracking.accountHistoryEntryID && tracking.accountVariant) {
      startAccountHistoryEntry({
        serverURL: multiplayerServerURL,
        accountToken: accountSession.token,
        entry: {
          id: tracking.accountHistoryEntryID,
          scope: "solo",
          variant: tracking.accountVariant,
          status: "started",
          outcome: "unknown",
          playerCount: config.options.playerCount,
          nationID: config.playerNationIds["0"]
        },
        onError: setOnlineStatus
      });
    }
    setSession({ ...config, ...tracking, id: Date.now(), kind: "local" });
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
    const tracking = accountSession
      ? {
        accountHistoryEntryID: createAccountHistoryID("online"),
        accountScope: "online" as const,
        accountVariant: "multiplayer" as const,
        accountPlayerID: record.playerID ?? "0"
      }
      : {};
    if (accountSession && tracking.accountHistoryEntryID) {
      const playerID = record.playerID ?? "0";
      startAccountHistoryEntry({
        serverURL: multiplayerServerURL,
        accountToken: accountSession.token,
        entry: {
          id: tracking.accountHistoryEntryID,
          scope: "online",
          variant: "multiplayer",
          status: "started",
          outcome: "unknown",
          matchID: record.matchID,
          playerID,
          playerCount: record.numPlayers,
          nationID: config.playerNationIds[playerID]
        },
        onError: setOnlineStatus
      });
    }
    setSession({
      ...config,
      ...tracking,
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
        hostName: args.playerName,
        clientID: onlineClientID
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
    if (savedOnlineSession?.kind === "lobby" && savedOnlineSession.lobbyID === args.lobbyID) {
      await rejoinOnlineGame();
      return;
    }
    setOnlineStatus("Joining lobby...");
    try {
      const joined = await joinLobbyRoom({
        serverURL: multiplayerServerURL,
        lobbyID: args.lobbyID,
        displayName: args.playerName,
        password: args.password,
        privateDataFingerprint: args.privateDataFingerprint,
        clientID: onlineClientID
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
    if (savedOnlineSession?.kind !== "lobby" && savedOnlineSession?.matchID === args.matchID) {
      await rejoinOnlineGame();
      return;
    }
    setOnlineStatus("Joining online game...");
    try {
      const joined = await joinPolityOnlineMatch({ serverURL: multiplayerServerURL, clientID: onlineClientID, ...args });
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
    if (!accountSession) {
      setOnlineStatus("Sign in to chat.");
      return;
    }
    try {
      const sent = await sendOnlineChat({ serverURL: multiplayerServerURL, accountToken: accountSession.token, author: onlinePlayerName, text });
      setOnlineChatMessages((current) => [...current, sent.message]);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not send chat message.");
    }
  };

  const sendCurrentLobbyMessage = async (text: string) => {
    if (!currentLobbySession) return;
    if (!accountSession) {
      setOnlineStatus("Sign in to chat.");
      return;
    }
    try {
      const sent = await sendLobbyChat({
        serverURL: multiplayerServerURL,
        lobbyID: currentLobbySession.lobbyID,
        lobbyCredentials: currentLobbySession.lobbyCredentials,
        accountToken: accountSession.token,
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

  const closeSavedOnlineMatch = async (record: OnlineSessionRecord) => {
    if (record.kind === "lobby" || record.playerID !== "0") return;
    setOnlineStatus(`Closing online room ${record.matchID}...`);
    try {
      await closePolityOnlineMatch({
        serverURL: record.serverURL,
        matchID: record.matchID,
        playerID: record.playerID
      });
      forgetOnlineSession();
      await refreshOnlineMatches();
      setOnlineStatus(`Closed online room ${record.matchID}.`);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not close online room.");
    }
  };

  const leaveCurrentLobby = async () => {
    if (!currentLobbySession) return;
    const leftLobbyID = currentLobbySession.lobbyID;
    setOnlineStatus(`Leaving lobby ${leftLobbyID}...`);
    try {
      await leaveLobbyRoom({
        serverURL: currentLobbySession.serverURL,
        lobbyID: currentLobbySession.lobbyID,
        lobbyCredentials: currentLobbySession.lobbyCredentials
      });
      forgetOnlineSession();
      setLobbyChatMessages([]);
      setHomeView("online");
      await refreshOnlineMatches();
      setOnlineStatus(`Left lobby ${leftLobbyID}.`);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not leave lobby.");
    }
  };

  const clearAllListedOnlineGames = async () => {
    if (!accountSession || accountSession.account.role !== "admin") {
      setOnlineStatus("Admin account required.");
      return;
    }
    setOnlineStatus("Clearing online games...");
    try {
      const cleared = await clearAllOnlineGames({ serverURL: multiplayerServerURL, accountToken: accountSession.token });
      forgetOnlineSession();
      setLobbyChatMessages([]);
      setOnlineChatMessages([]);
      setListedLobbies([]);
      setListedMatches([]);
      setHomeView("online");
      await refreshOnlineMatches();
      setOnlineStatus(`Cleared ${cleared.lobbiesCleared + cleared.matchesCleared} online game${cleared.lobbiesCleared + cleared.matchesCleared === 1 ? "" : "s"}.`);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : "Could not clear online games.");
    }
  };

  const registerCurrentAccount = async (input: { email: string; username: string; password: string }) => {
    setAccountStatus("Creating account...");
    try {
      const created = await registerAccount({ serverURL: multiplayerServerURL, ...input });
      const record = { token: created.token, account: created.account };
      saveAccountSessionRecord(record);
      setAccountSession(record);
      setOnlinePlayerName(created.account.username);
      setAccountStatus(`Signed in as ${created.account.username}.`);
    } catch (error) {
      setAccountStatus(error instanceof Error ? error.message : "Could not create account.");
    }
  };

  const signInCurrentAccount = async (input: { login: string; password: string }) => {
    setAccountStatus("Signing in...");
    try {
      const signedIn = await signInAccount({ serverURL: multiplayerServerURL, ...input });
      const record = { token: signedIn.token, account: signedIn.account };
      saveAccountSessionRecord(record);
      setAccountSession(record);
      setOnlinePlayerName(signedIn.account.username);
      setAccountStatus(`Signed in as ${signedIn.account.username}.`);
    } catch (error) {
      setAccountStatus(error instanceof Error ? error.message : "Could not sign in.");
    }
  };

  const signInForOnlineGames = async (config: NewGameSessionConfig, input: { login: string; password: string }) => {
    setAccountStatus("Signing in...");
    try {
      const signedIn = await signInAccount({ serverURL: multiplayerServerURL, ...input });
      const record = { token: signedIn.token, account: signedIn.account };
      saveAccountSessionRecord(record);
      setAccountSession(record);
      setOnlinePlayerName(signedIn.account.username);
      openOnlineGames(config, signedIn.account.username);
      setAccountStatus(`Signed in as ${signedIn.account.username}.`);
    } catch (error) {
      setAccountStatus(error instanceof Error ? error.message : "Could not sign in.");
    }
  };

  const requestCurrentPasswordReset = async (input: { email: string }) => {
    setAccountStatus("Sending reset link...");
    try {
      const resetURLBase = typeof window === "undefined" ? undefined : `${window.location.origin}/reset-password`;
      const result = await requestPasswordReset({ serverURL: multiplayerServerURL, resetURLBase, ...input });
      setAccountStatus(result.resetLink ? `Reset link: ${result.resetLink}` : "If that email exists, a reset link has been sent.");
    } catch (error) {
      setAccountStatus(error instanceof Error ? error.message : "Could not send reset link.");
    }
  };

  const completeCurrentPasswordReset = async (input: { token: string; password: string; passwordConfirmation: string }) => {
    setAccountStatus("Resetting password...");
    try {
      await completePasswordReset({
        serverURL: multiplayerServerURL,
        token: resetTokenFromInput(input.token),
        password: input.password,
        passwordConfirmation: input.passwordConfirmation
      });
      setAccountStatus("Password reset. Sign in with the new password.");
    } catch (error) {
      setAccountStatus(error instanceof Error ? error.message : "Could not reset password.");
    }
  };

  const changeCurrentAccountPassword = async (input: { currentPassword: string; password: string }) => {
    if (!accountSession) {
      setAccountStatus("Sign in to change your password.");
      return;
    }
    setAccountStatus("Changing password...");
    try {
      await changeAccountPassword({ serverURL: multiplayerServerURL, accountToken: accountSession.token, ...input });
      clearAccountSessionRecord();
      setAccountSession(undefined);
      setAccountStatus("Password changed. Sign in with the new password.");
    } catch (error) {
      setAccountStatus(error instanceof Error ? error.message : "Could not change password.");
    }
  };

  const signOutCurrentAccount = async () => {
    const token = accountSession?.token;
    clearAccountSessionRecord();
    setAccountSession(undefined);
    setAccountStatus("Signed out.");
    if (!token) return;
    await signOutAccount({ serverURL: multiplayerServerURL, accountToken: token }).catch(() => undefined);
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
            onLeave={leaveCurrentLobby}
            canChat={Boolean(accountSession)}
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
            account={accountSession?.account}
            accountStatusMessage={accountStatus}
            statusMessage={onlineStatus}
            onBackToSetup={() => setHomeView("setup")}
            onRefresh={refreshOnlineMatches}
            onHost={hostOnlineGame}
            onJoinLobby={joinOnlineLobby}
            onJoin={joinOnlineGame}
            onSpectate={spectateOnlineGame}
            onRejoin={() => void rejoinOnlineGame()}
            onForgetSession={() => forgetOnlineSession()}
            onCloseSession={(record) => void closeSavedOnlineMatch(record)}
            onSendChat={sendOnlineLoungeMessage}
            onClearAllGames={() => void clearAllListedOnlineGames()}
            onRegisterAccount={(input) => void registerCurrentAccount(input)}
            onSignInAccount={(input) => void signInCurrentAccount(input)}
            onRequestPasswordReset={(input) => void requestCurrentPasswordReset(input)}
            onCompletePasswordReset={(input) => void completeCurrentPasswordReset(input)}
            onChangePassword={(input) => void changeCurrentAccountPassword(input)}
            onSignOutAccount={() => void signOutCurrentAccount()}
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
          account={accountSession?.account}
          accountStatusMessage={accountStatus}
          onSignInForOnline={(config, input) => void signInForOnlineGames(config, input)}
          onRequestPasswordReset={(input) => void requestCurrentPasswordReset(input)}
          onCompletePasswordReset={(input) => void completeCurrentPasswordReset(input)}
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
