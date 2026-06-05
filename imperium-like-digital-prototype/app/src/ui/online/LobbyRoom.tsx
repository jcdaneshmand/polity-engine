import { useState } from "react";
import type { ChatMessage, LobbyRoomDetails } from "../../onlineSession";
import { getNationOptions, type NewGameSessionConfig } from "../setup/NewGameSetup";

type LobbyRoomProps = {
  lobby: LobbyRoomDetails;
  setupConfig: NewGameSessionConfig;
  statusMessage: string;
  chatMessages?: ChatMessage[];
  onBack: () => void;
  onRefresh: () => void | Promise<void>;
  onEditSetup: () => void;
  onSelectNation: (nationID: string) => void | Promise<void>;
  onReady: (ready: boolean) => void | Promise<void>;
  onStart: () => void | Promise<void>;
  onSendChat?: (text: string) => void | Promise<void>;
};

function seatLabel(seatID: string): string {
  return `Player ${Number(seatID) + 1}`;
}

function selectedNationLabel(nationID: string | undefined, nations: Array<{ id: string; label: string }>): string {
  if (!nationID) return "No nation";
  return nations.find((nation) => nation.id === nationID)?.label ?? nationID;
}

function formatSummaryList(values: string[]): string {
  return values.length ? values.join(", ") : "None";
}

export async function readyWithSelectedNation(args: {
  currentSelectedNationID: string | undefined;
  displayedNationID: string;
  nextReady: boolean;
  onSelectNation: (nationID: string) => void | Promise<void>;
  onReady: (ready: boolean) => void | Promise<void>;
}): Promise<void> {
  if (!args.currentSelectedNationID) {
    await args.onSelectNation(args.displayedNationID);
  }
  await args.onReady(args.nextReady);
}

export default function LobbyRoom({
  lobby,
  setupConfig,
  statusMessage,
  chatMessages = [],
  onBack,
  onRefresh,
  onEditSetup,
  onSelectNation,
  onReady,
  onStart,
  onSendChat
}: LobbyRoomProps) {
  const [chatText, setChatText] = useState("");
  const selfSeat = lobby.seats.find((seat) => seat.isSelf);
  const nations = getNationOptions(setupConfig.options.enabledExpansions, setupConfig.privateData);
  const selectedNationID = selfSeat?.selectedNationID ?? nations[0]?.id ?? "test_nation_sun_coast";
  const isLocked = lobby.status === "locked";

  const submitChat = () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText("");
    void onSendChat?.(text);
  };

  return (
    <main className="setup-screen online-games-screen">
      <section className="setup-panel online-games-panel" aria-labelledby="lobby-room-title">
        <div className="setup-heading">
          <div>
            <p className="setup-kicker">Pregame lobby</p>
            <h1 id="lobby-room-title">{lobby.roomName}</h1>
            <div className="lobby-room-code" aria-label="Room code">
              <span>Room code</span>
              <strong>{lobby.lobbyID}</strong>
            </div>
          </div>
          <div className="private-data-actions">
            <button type="button" onClick={onRefresh}>Refresh</button>
            <button type="button" onClick={onBack}>Online Games</button>
          </div>
        </div>
        {statusMessage ? <p className="online-games-status">{statusMessage}</p> : null}

        <section className="setup-stage" aria-labelledby="lobby-chat">
          <h2 id="lobby-chat">Lobby Chat</h2>
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
              <input value={chatText} onChange={(event: { target: HTMLInputElement }) => setChatText(event.target.value)} />
            </label>
            <button type="button" disabled={!chatText.trim() || !onSendChat} onClick={submitChat}>Send</button>
          </div>
        </section>

        <section className="setup-stage" aria-labelledby="lobby-setup-summary">
          <h2 id="lobby-setup-summary">Current setup</h2>
          <div className="online-card-grid">
            <article className="online-card">
              <strong>{lobby.playerCount} players</strong>
              <span>Commons: {lobby.setupSummary.commonsSetId}</span>
              <small>Expansions: {formatSummaryList(lobby.setupSummary.enabledExpansions)}</small>
              <small>Variants: {formatSummaryList(lobby.setupSummary.enabledVariants)}</small>
              <small>Nations: {formatSummaryList(lobby.setupSummary.nationLabels)}</small>
            </article>
          </div>
        </section>

        {lobby.viewer.isHost ? (
          <section className="setup-stage" aria-labelledby="lobby-host-controls">
            <h2 id="lobby-host-controls">Host controls</h2>
            <div className="online-games-actions">
              <button type="button" disabled={isLocked} onClick={onEditSetup}>Edit Setup</button>
              {isLocked ? <button type="button" onClick={() => void onReady(false)}>Unlock Setup</button> : null}
              {isLocked ? <button className="primary-action" type="button" onClick={() => void onStart()}>Start Game</button> : null}
            </div>
          </section>
        ) : null}

        <section className="setup-stage" aria-labelledby="lobby-seats">
          <h2 id="lobby-seats">Seats</h2>
          <div className="online-card-grid">
            {lobby.seats.map((seat) => (
              <article className="online-card" key={seat.seatID}>
                <strong>{seat.displayName || seatLabel(seat.seatID)}{seat.isSelf ? " (You)" : ""}</strong>
                <span>{seat.isHost ? "Host" : seatLabel(seat.seatID)}</span>
                <small>{selectedNationLabel(seat.selectedNationID, nations)}</small>
                <small>{seat.ready ? "Ready" : "Not ready"}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="setup-stage" aria-labelledby="lobby-player-controls">
          <h2 id="lobby-player-controls">Your seat</h2>
          <div className="online-games-actions">
            <label className="setup-field">
              <span>Nation</span>
              <select value={selectedNationID} disabled={isLocked} onChange={(event: { target: HTMLSelectElement }) => void onSelectNation(event.target.value)}>
                {nations.map((nation) => <option key={nation.id} value={nation.id}>{nation.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedNationID}
              onClick={() => void readyWithSelectedNation({
                currentSelectedNationID: selfSeat?.selectedNationID,
                displayedNationID: selectedNationID,
                nextReady: !selfSeat?.ready,
                onSelectNation,
                onReady
              })}
            >
              {selfSeat?.ready ? "Unready" : "Ready"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
