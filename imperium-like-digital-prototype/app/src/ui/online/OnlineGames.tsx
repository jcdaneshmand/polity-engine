import { useState } from "react";
import type { ListedMatch, OnlineSessionRecord } from "../../onlineSession";
import type { NewGameSessionConfig } from "../setup/NewGameSetup";

type OnlineGamesProps = {
  setupConfig: NewGameSessionConfig;
  privateDataFingerprint: string;
  savedSessions: OnlineSessionRecord[];
  matches: ListedMatch[];
  statusMessage: string;
  onBackToSetup: () => void;
  onRefresh: () => void | Promise<void>;
  onHost: (args: { roomName: string; password?: string; setupConfig: NewGameSessionConfig; privateDataFingerprint: string }) => void | Promise<void>;
  onJoin: (args: { matchID: string; playerID: string; playerName: string; password?: string; privateDataFingerprint: string; setupConfig: NewGameSessionConfig }) => void | Promise<void>;
  onSpectate: (args: { matchID: string; password?: string; privateDataFingerprint: string }) => void | Promise<void>;
  onRejoin: (record: OnlineSessionRecord) => void;
  onForgetSession: (record: OnlineSessionRecord) => void;
};

function playerLabel(playerID: string | undefined): string {
  if (playerID === undefined) return "Spectator";
  return `Player ${Number(playerID) + 1}`;
}

function privateDataStatus(match: ListedMatch, privateDataFingerprint: string): "compatible" | "mismatch" {
  if (match.privateDataLabel === "placeholder") return "compatible";
  return privateDataFingerprint === "placeholder" ? "mismatch" : "compatible";
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
  privateDataFingerprint,
  savedSessions,
  matches,
  statusMessage,
  onBackToSetup,
  onRefresh,
  onHost,
  onJoin,
  onSpectate,
  onRejoin,
  onForgetSession
}: OnlineGamesProps) {
  const [roomName, setRoomName] = useState("Polity Table");
  const [hostPassword, setHostPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [playerName, setPlayerName] = useState("Player");
  const [matchPasswords, setMatchPasswords] = useState<Record<string, string>>({});

  const submitHost = () => {
    void onHost({
      roomName,
      password: hostPassword.trim() || undefined,
      setupConfig,
      privateDataFingerprint
    });
  };

  const submitJoinByCode = () => {
    const matchID = joinCode.trim();
    if (!matchID) return;
    void onJoin({
      matchID,
      playerID: "0",
      playerName: playerName.trim() || "Player",
      password: joinPassword.trim() || undefined,
      privateDataFingerprint,
      setupConfig
    });
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
            <button type="button" onClick={onBackToSetup}>Setup</button>
          </div>
        </div>
        {statusMessage ? <p className="online-games-status">{statusMessage}</p> : null}

        <section className="setup-stage" aria-labelledby="online-resume">
          <h2 id="online-resume">Resume Games</h2>
          <div className="online-card-grid">
            {savedSessions.length ? savedSessions.map((record) => (
              <article className="online-card" key={`${record.kind ?? "player"}-${record.matchID}-${record.playerID ?? "spectator"}`}>
                <strong>{record.matchID}</strong>
                <span>{playerLabel(record.playerID)}</span>
                <small>Saved {record.savedAt}</small>
                <div className="private-data-actions">
                  <button type="button" onClick={() => onRejoin(record)}>Rejoin</button>
                  <button type="button" onClick={() => onForgetSession(record)}>Forget</button>
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
            <button type="button" onClick={submitJoinByCode} disabled={!joinCode.trim()}>Join By Code</button>
          </div>
        </section>

        <section className="setup-stage" aria-labelledby="online-browse">
          <h2 id="online-browse">Browse Games</h2>
          <div className="online-match-list">
            {matches.length ? matches.map((match) => {
              const dataStatus = privateDataStatus(match, privateDataFingerprint);
              const blockedByData = dataStatus === "mismatch";
              const password = matchPasswords[match.matchID] ?? "";
              const openSeat = match.availableSeats[0];
              const canJoin = match.status === "setup" && Boolean(openSeat) && !blockedByData && (!match.isLocked || password.trim());
              const canSpectate = match.spectatingAllowed && !blockedByData && (!match.isLocked || password.trim());
              return (
                <article className="online-match-row" key={match.matchID}>
                  <div>
                    <strong>{match.roomName}</strong>
                    <span>{statusLabel(match.status)} - {match.isLocked ? "Locked" : "Open"} - {match.occupiedSeats.length}/{match.playerCount} seats</span>
                    <small>{formatSeatList(match)}</small>
                    <small>{match.privateDataLabel === "private_data_required" ? "Private data required" : "Placeholder data"}</small>
                    {blockedByData ? <small className="online-warning">Different private data loaded</small> : null}
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
                      onClick={() => openSeat && void onJoin({
                        matchID: match.matchID,
                        playerID: openSeat,
                        playerName,
                        password: password.trim() || undefined,
                        privateDataFingerprint,
                        setupConfig
                      })}
                    >
                      Join Seat
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
            }) : <p className="setup-help">No online games are listed yet.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
