import type { LobbyRoomDetails } from "../../onlineSession";
import { getNationOptions, type NewGameSessionConfig } from "../setup/NewGameSetup";

type LobbyRoomProps = {
  lobby: LobbyRoomDetails;
  setupConfig: NewGameSessionConfig;
  statusMessage: string;
  onBack: () => void;
  onRefresh: () => void | Promise<void>;
  onEditSetup: () => void;
  onSelectNation: (nationID: string) => void | Promise<void>;
  onReady: (ready: boolean) => void | Promise<void>;
  onStart: () => void | Promise<void>;
};

function seatLabel(seatID: string): string {
  return `Player ${Number(seatID) + 1}`;
}

function selectedNationLabel(nationID: string | undefined, nations: Array<{ id: string; label: string }>): string {
  if (!nationID) return "No nation";
  return nations.find((nation) => nation.id === nationID)?.label ?? nationID;
}

export default function LobbyRoom({
  lobby,
  setupConfig,
  statusMessage,
  onBack,
  onRefresh,
  onEditSetup,
  onSelectNation,
  onReady,
  onStart
}: LobbyRoomProps) {
  const selfSeat = lobby.seats.find((seat) => seat.isSelf);
  const nations = getNationOptions(setupConfig.options.enabledExpansions, setupConfig.privateData);
  const selectedNationID = selfSeat?.selectedNationID ?? nations[0]?.id ?? "test_nation_sun_coast";
  const isLocked = lobby.status === "locked";

  return (
    <main className="setup-screen online-games-screen">
      <section className="setup-panel online-games-panel" aria-labelledby="lobby-room-title">
        <div className="setup-heading">
          <div>
            <p className="setup-kicker">Pregame lobby</p>
            <h1 id="lobby-room-title">{lobby.roomName}</h1>
          </div>
          <div className="private-data-actions">
            <button type="button" onClick={onRefresh}>Refresh</button>
            <button type="button" onClick={onBack}>Online Games</button>
          </div>
        </div>
        {statusMessage ? <p className="online-games-status">{statusMessage}</p> : null}

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
            <button type="button" disabled={!selfSeat?.selectedNationID && !selectedNationID} onClick={() => void onReady(!selfSeat?.ready)}>
              {selfSeat?.ready ? "Unready" : "Ready"}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
