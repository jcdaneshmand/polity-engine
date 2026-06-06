import { useState } from "react";
import type { AccountPublicView } from "../../accountSession";
import type { ChatMessage, ListedLobby, ListedMatch, OnlineSessionRecord } from "../../onlineSession";
import type { NewGameSessionConfig } from "../setup/NewGameSetup";
import AccountPanel from "./AccountPanel";

type OnlineGamesProps = {
  setupConfig: NewGameSessionConfig;
  initialPlayerName?: string;
  privateDataFingerprint: string;
  savedSessions: OnlineSessionRecord[];
  lobbies: ListedLobby[];
  matches: ListedMatch[];
  chatMessages?: ChatMessage[];
  account?: AccountPublicView;
  passwordResetToken?: string;
  accountStatusMessage?: string;
  statusMessage: string;
  onBackToSetup: () => void;
  onRefresh: () => void | Promise<void>;
  onHost: (args: { roomName: string; playerName: string; password?: string; setupConfig: NewGameSessionConfig; privateDataFingerprint: string }) => void | Promise<void>;
  onJoinLobby: (args: { lobbyID: string; playerName: string; password?: string; privateDataFingerprint: string }) => void | Promise<void>;
  onJoin: (args: { matchID: string; playerID?: string; playerName: string; password?: string; privateDataFingerprint: string; setupConfig: NewGameSessionConfig }) => void | Promise<void>;
  onSpectate: (args: { matchID: string; password?: string; privateDataFingerprint: string }) => void | Promise<void>;
  onRejoin: (record: OnlineSessionRecord) => void;
  onForgetSession: (record: OnlineSessionRecord) => void;
  onCloseSession?: (record: OnlineSessionRecord) => void;
  onSendChat?: (text: string) => void | Promise<void>;
  onClearAllGames?: () => void | Promise<void>;
  onRegisterAccount?: (input: { email: string; username: string; password: string }) => void | Promise<void>;
  onSignInAccount?: (input: { login: string; password: string }) => void | Promise<void>;
  onRequestPasswordReset?: (input: { email: string }) => void | Promise<void>;
  onCompletePasswordReset?: (input: { token: string; password: string; passwordConfirmation: string }) => void | Promise<void>;
  onChangePassword?: (input: { currentPassword: string; password: string }) => void | Promise<void>;
  onSignOutAccount?: () => void | Promise<void>;
};

function playerLabel(playerID: string | undefined): string {
  if (playerID === undefined) return "Spectator";
  return `Player ${Number(playerID) + 1}`;
}

function privateDataStatus(match: ListedMatch, privateDataFingerprint: string): "compatible" | "missing" | "server_check" {
  if (match.privateDataLabel === "placeholder") return "compatible";
  return privateDataFingerprint === "placeholder" ? "missing" : "server_check";
}

export function findSavedLobbySession(savedSessions: OnlineSessionRecord[], lobbyID: string): OnlineSessionRecord | undefined {
  return savedSessions.find((record) => record.kind === "lobby" && record.lobbyID === lobbyID);
}

export function findSavedMatchSession(savedSessions: OnlineSessionRecord[], matchID: string): OnlineSessionRecord | undefined {
  return savedSessions.find((record) => record.kind !== "lobby" && record.matchID === matchID);
}

export function isChatSubmitKey(event: { key: string; shiftKey: boolean }): boolean {
  return event.key === "Enter" && !event.shiftKey;
}

function savedSessionLabel(record: OnlineSessionRecord): string {
  if (record.kind === "lobby") return record.lobbyID;
  return record.matchID;
}

function savedSessionRole(record: OnlineSessionRecord): string {
  if (record.kind === "lobby") return `Lobby ${playerLabel(record.seatID)}`;
  return playerLabel(record.playerID);
}

function canCloseSavedSession(record: OnlineSessionRecord): boolean {
  return record.kind !== "lobby" && record.playerID === "0";
}

function statusLabel(status: ListedMatch["status"]): string {
  if (status === "in_progress") return "In progress";
  if (status === "ended") return "Ended";
  return "Open";
}

function formatSeatList(match: ListedMatch): string {
  return match.occupiedSeats.length
    ? match.occupiedSeats.map((seat) => `${playerLabel(seat.playerID)}: ${seat.playerName}`).join(", ")
    : "No seats occupied";
}

export default function OnlineGames({
  setupConfig,
  initialPlayerName = "Player",
  privateDataFingerprint,
  savedSessions,
  lobbies,
  matches,
  chatMessages = [],
  account,
  passwordResetToken,
  accountStatusMessage = "",
  statusMessage,
  onBackToSetup,
  onRefresh,
  onHost,
  onJoinLobby,
  onJoin,
  onSpectate,
  onRejoin,
  onForgetSession,
  onCloseSession,
  onSendChat,
  onClearAllGames,
  onRegisterAccount = () => undefined,
  onSignInAccount = () => undefined,
  onRequestPasswordReset = () => undefined,
  onCompletePasswordReset = () => undefined,
  onChangePassword = () => undefined,
  onSignOutAccount = () => undefined
}: OnlineGamesProps) {
  const [roomName, setRoomName] = useState("Polity Table");
  const [hostPassword, setHostPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [playerName, setPlayerName] = useState(initialPlayerName.trim() || "Player");
  const [matchPasswords, setMatchPasswords] = useState<Record<string, string>>({});
  const [chatText, setChatText] = useState("");
  const canChat = Boolean(account && onSendChat);

  const submitHost = () => {
    void onHost({
      roomName,
      playerName: playerName.trim() || "Player",
      password: hostPassword.trim() || undefined,
      setupConfig,
      privateDataFingerprint
    });
  };

  const submitJoinLobbyByCode = () => {
    const lobbyID = joinCode.trim();
    if (!lobbyID) return;
    void onJoinLobby({
      lobbyID,
      playerName: playerName.trim() || "Player",
      password: joinPassword.trim() || undefined,
      privateDataFingerprint
    });
  };

  const submitChat = () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText("");
    if (!canChat) return;
    void onSendChat?.(text);
  };

  return (
    <main className="setup-screen online-games-screen">
      <section className="setup-panel online-games-panel" aria-labelledby="online-games-title">
        <div className="setup-heading">
          <div>
            <p className="setup-kicker">Hosted multiplayer</p>
            <h1 id="online-games-title">Online Games</h1>
          </div>
          <div className="private-data-actions">
            <button type="button" onClick={onRefresh}>Refresh</button>
            {account?.role === "admin" && onClearAllGames ? <button type="button" onClick={() => void onClearAllGames()}>Clear All Games</button> : null}
            <button type="button" onClick={onBackToSetup}>Setup</button>
          </div>
        </div>
        {statusMessage ? <p className="online-games-status">{statusMessage}</p> : null}

        <AccountPanel
          account={account}
          passwordResetToken={passwordResetToken}
          statusMessage={accountStatusMessage}
          onRegister={onRegisterAccount}
          onSignIn={onSignInAccount}
          onRequestPasswordReset={onRequestPasswordReset}
          onCompletePasswordReset={onCompletePasswordReset}
          onChangePassword={onChangePassword}
          onSignOut={onSignOutAccount}
        />

        <section className="setup-stage" aria-labelledby="online-chat">
          <h2 id="online-chat">Online Chat</h2>
          {!account ? <p className="setup-help">Sign in to chat.</p> : null}
          <div className="online-chat-log">
            {chatMessages.length ? chatMessages.map((message) => (
              <div className="online-chat-message" key={message.id}>
                <strong>{message.author}</strong>
                <span>{message.text}</span>
              </div>
            )) : <p className="setup-help">No messages yet.</p>}
          </div>
          <div className="online-games-actions">
            <label className="setup-field">
              <span>Message</span>
              <input
                value={chatText}
                disabled={!canChat}
                onChange={(event: { target: HTMLInputElement }) => setChatText(event.target.value)}
                onKeyDown={(event: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
                  if (!isChatSubmitKey(event)) return;
                  event.preventDefault();
                  submitChat();
                }}
              />
            </label>
            <button type="button" disabled={!chatText.trim() || !canChat} onClick={submitChat}>Send</button>
          </div>
        </section>

        <section className="setup-stage" aria-labelledby="online-resume">
          <h2 id="online-resume">Resume Games</h2>
          <div className="online-card-grid">
            {savedSessions.length ? savedSessions.map((record) => (
              <article className="online-card" key={`${record.kind ?? "player"}-${savedSessionLabel(record)}`}>
                <strong>{savedSessionLabel(record)}</strong>
                <span>{savedSessionRole(record)}</span>
                <small>Saved {record.savedAt}</small>
                <div className="private-data-actions">
                  <button type="button" onClick={() => onRejoin(record)}>Rejoin</button>
                  <button type="button" onClick={() => onForgetSession(record)}>Forget</button>
                  {canCloseSavedSession(record) && onCloseSession ? <button type="button" onClick={() => onCloseSession(record)}>Close Match</button> : null}
                </div>
              </article>
            )) : <p className="setup-help">No saved online games in this browser.</p>}
          </div>
        </section>

        <section className="setup-stage" aria-labelledby="online-host">
          <h2 id="online-host">Host Game</h2>
          <div className="online-games-actions">
            <label className="setup-field">
              <span>Room name</span>
              <input value={roomName} onChange={(event: { target: HTMLInputElement }) => setRoomName(event.target.value)} />
            </label>
            <label className="setup-field">
              <span>Password optional</span>
              <input value={hostPassword} onChange={(event: { target: HTMLInputElement }) => setHostPassword(event.target.value)} />
            </label>
            <div className="online-card">
              <strong>{setupConfig.options.playerCount} players</strong>
              <span>{setupConfig.options.commonsSetId ?? "classics"}</span>
              <small>{privateDataFingerprint === "placeholder" ? "Placeholder data" : "Private data loaded"}</small>
            </div>
            <button className="primary-action" type="button" onClick={submitHost}>Host Game</button>
          </div>
        </section>

        <section className="setup-stage" aria-labelledby="online-code">
          <h2 id="online-code">Join By Code</h2>
          <div className="online-games-actions">
            <label className="setup-field">
              <span>Room code</span>
              <input value={joinCode} onChange={(event: { target: HTMLInputElement }) => setJoinCode(event.target.value)} />
            </label>
            <label className="setup-field">
              <span>Password</span>
              <input value={joinPassword} onChange={(event: { target: HTMLInputElement }) => setJoinPassword(event.target.value)} />
            </label>
            <label className="setup-field">
              <span>Name</span>
              <input value={playerName} onChange={(event: { target: HTMLInputElement }) => setPlayerName(event.target.value)} />
            </label>
            <button type="button" onClick={submitJoinLobbyByCode} disabled={!joinCode.trim()}>Join Lobby</button>
          </div>
        </section>

        <section className="setup-stage" aria-labelledby="online-browse">
          <h2 id="online-browse">Browse Games</h2>
          <div className="online-match-list">
            {lobbies.map((lobby) => {
              const password = matchPasswords[lobby.lobbyID] ?? "";
              const savedLobbySession = findSavedLobbySession(savedSessions, lobby.lobbyID);
              const needsPassword = lobby.isLocked && !password.trim();
              const blockedByData = lobby.privateDataLabel === "private_data_required" && privateDataFingerprint === "placeholder";
              const canJoinLobby = Boolean(savedLobbySession) || lobby.availableSeats.length > 0 && !needsPassword && !blockedByData;
              return (
                <article className="online-match-row" key={lobby.lobbyID}>
                  <div>
                    <strong>{lobby.roomName}</strong>
                    <span>Lobby - {lobby.status === "locked" ? "Ready to start" : "Waiting"} - {lobby.occupiedSeats.length}/{lobby.playerCount} seats</span>
                    <small>{lobby.occupiedSeats.length ? lobby.occupiedSeats.map((seat) => `${seat.displayName}: ${seat.ready ? "ready" : "not ready"}`).join(", ") : "No seats occupied"}</small>
                    <small>{lobby.privateDataLabel === "private_data_required" ? "Private data required" : "Placeholder data"}</small>
                    {blockedByData ? <small className="online-warning">Import matching private data to enter</small> : null}
                  </div>
                  <div className="online-match-actions">
                    {lobby.isLocked ? (
                      <label className="setup-field">
                        <span>Password</span>
                        <input value={password} onChange={(event: { target: HTMLInputElement }) => setMatchPasswords((current) => ({ ...current, [lobby.lobbyID]: event.target.value }))} />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      disabled={!canJoinLobby}
                      onClick={() => {
                        if (savedLobbySession) {
                          onRejoin(savedLobbySession);
                          return;
                        }
                        void onJoinLobby({
                          lobbyID: lobby.lobbyID,
                          playerName,
                          password: password.trim() || undefined,
                          privateDataFingerprint
                        });
                      }}
                    >
                      {savedLobbySession ? "Rejoin Lobby" : "Join Lobby"}
                    </button>
                  </div>
                </article>
              );
            })}
            {matches.length ? matches.map((match) => {
              const dataStatus = privateDataStatus(match, privateDataFingerprint);
              const blockedByData = dataStatus === "missing";
              const password = matchPasswords[match.matchID] ?? "";
              const savedMatchSession = findSavedMatchSession(savedSessions, match.matchID);
              const openSeat = match.availableSeats[0];
              const canJoin = Boolean(savedMatchSession) || match.status === "setup" && Boolean(openSeat) && !blockedByData && (!match.isLocked || password.trim());
              const canSpectate = match.spectatingAllowed && !blockedByData && (!match.isLocked || password.trim());
              return (
                <article className="online-match-row" key={match.matchID}>
                  <div>
                    <strong>{match.roomName}</strong>
                    <span>{statusLabel(match.status)} - {match.isLocked ? "Locked" : "Open"} - {match.occupiedSeats.length}/{match.playerCount} seats</span>
                    <small>{formatSeatList(match)}</small>
                    <small>{match.privateDataLabel === "private_data_required" ? "Private data required" : "Placeholder data"}</small>
                    {dataStatus === "missing" ? <small className="online-warning">Import matching private data to enter</small> : null}
                    {dataStatus === "server_check" ? <small>Server will verify exact private data before entry</small> : null}
                  </div>
                  <div className="online-match-actions">
                    {match.isLocked ? (
                      <label className="setup-field">
                        <span>Password</span>
                        <input value={password} onChange={(event: { target: HTMLInputElement }) => setMatchPasswords((current) => ({ ...current, [match.matchID]: event.target.value }))} />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      disabled={!canJoin}
                      onClick={() => {
                        if (savedMatchSession) {
                          onRejoin(savedMatchSession);
                          return;
                        }
                        if (!openSeat) return;
                        void onJoin({
                          matchID: match.matchID,
                          playerID: openSeat,
                          playerName,
                          password: password.trim() || undefined,
                          privateDataFingerprint,
                          setupConfig
                        });
                      }}
                    >
                      {savedMatchSession ? "Rejoin Seat" : "Join Seat"}
                    </button>
                    <button
                      type="button"
                      disabled={!canSpectate}
                      onClick={() => void onSpectate({ matchID: match.matchID, password: password.trim() || undefined, privateDataFingerprint })}
                    >
                      Spectate
                    </button>
                  </div>
                </article>
              );
            }) : null}
            {!lobbies.length && !matches.length ? <p className="setup-help">No online games are listed yet.</p> : null}
          </div>
        </section>
      </section>
    </main>
  );
}
