import { useMemo, useState } from "react";
import type { CommonsSetId, ExpansionId, GameMode, GameOptions, SoloDifficulty, VariantId } from "../../../../engine/src/options/gameOptions";
import { loadNationDb } from "../../../../engine/src/nations/nationLoader";
import { loadBotStateTables } from "../../../../engine/src/solo/botStateTableLoader";
import type { PrivateDataBundle } from "../../../../engine/src/setup/privateDataBundle";
import { getBotNationSetupOptions } from "./botNationOptions";
import { hasPrivateData, importPrivateDataFiles, type PrivateDataFileStatus } from "./privateDataImport";

export type NewGameSessionConfig = {
  options: GameOptions;
  playerNationIds: Record<string, string>;
  soloBotNationId?: string;
  privateData?: PrivateDataBundle;
};

type NewGameSetupProps = {
  onStart: (config: NewGameSessionConfig) => void;
  onOpenCardEntry?: () => void;
};

const DEFAULT_NATION_ID = "test_nation_sun_coast";

const modes: Array<{ id: GameMode; label: string }> = [
  { id: "multiplayer", label: "Multiplayer" },
  { id: "solo", label: "Solo" },
  { id: "practice", label: "Practice" }
];

const expansions: Array<{ id: ExpansionId; label: string }> = [{ id: "trade_routes", label: "Trade Routes" }];

const commonsSets: Array<{ id: CommonsSetId; label: string }> = [
  { id: "classics", label: "Classics" },
  { id: "legends", label: "Legends" },
  { id: "horizons", label: "Horizons" },
  { id: "custom", label: "Custom" }
];

const variants: Array<{ id: VariantId; label: string }> = [
  { id: "lowered_aggression", label: "Lowered Aggression" },
  { id: "quick_setup", label: "Quick Setup" },
  { id: "precious_cards", label: "Precious Cards" },
  { id: "short_game", label: "Short Game" }
];

const soloDifficulties: Array<{ id: SoloDifficulty; label: string }> = [
  { id: "chieftain", label: "Chieftain" },
  { id: "warlord", label: "Warlord" },
  { id: "imperator", label: "Imperator" },
  { id: "sovereign", label: "Sovereign" },
  { id: "overlord", label: "Overlord" },
  { id: "supreme_ruler", label: "Supreme Ruler" }
];

type NationOption = { id: string; label: string };

function getNationOptions(enabledExpansions: ExpansionId[], privateData?: PrivateDataBundle): NationOption[] {
  const nations = privateData?.nations?.length ? privateData.nations : Object.values(loadNationDb({ enabledExpansions }));
  return nations
    .filter((nation) => !nation.requiredExpansions.some((expansion) => !enabledExpansions.includes(expansion)) && !(nation.excludedExpansions ?? []).some((expansion) => enabledExpansions.includes(expansion)))
    .map((nation) => ({
    id: nation.id,
    label: nation.displayName
  }));
}

function firstNationId(nations: NationOption[]): string {
  return nations[0]?.id ?? DEFAULT_NATION_ID;
}

function playerCountForMode(mode: GameMode, requested: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  if (mode === "solo" || mode === "practice") return 1;
  return requested < 2 ? 2 : requested;
}

function toggleItem<T extends string>(items: T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

export default function NewGameSetup({ onStart, onOpenCardEntry }: NewGameSetupProps) {
  const [mode, setMode] = useState<GameMode>("multiplayer");
  const [playerCount, setPlayerCount] = useState<1 | 2 | 3 | 4>(2);
  const [enabledExpansions, setEnabledExpansions] = useState<ExpansionId[]>([]);
  const [enabledVariants, setEnabledVariants] = useState<VariantId[]>([]);
  const [commonsSetId, setCommonsSetId] = useState<CommonsSetId>("classics");
  const [soloDifficulty, setSoloDifficulty] = useState<SoloDifficulty>("chieftain");
  const [soloBotNationId, setSoloBotNationId] = useState<string>("random");
  const [privateData, setPrivateData] = useState<PrivateDataBundle>({});
  const [privateFileStatuses, setPrivateFileStatuses] = useState<PrivateDataFileStatus[]>([]);
  const [playerNationIds, setPlayerNationIds] = useState<Record<string, string>>({
    "1": DEFAULT_NATION_ID,
    "2": DEFAULT_NATION_ID,
    "3": DEFAULT_NATION_ID,
    "4": DEFAULT_NATION_ID
  });

  const normalizedPlayerCount = playerCountForMode(mode, playerCount);
  const availableNations = useMemo(
    () => getNationOptions(enabledExpansions, privateData),
    [enabledExpansions, privateData]
  );
  const botNationOptions = useMemo(
    () => getBotNationSetupOptions(availableNations, loadBotStateTables()),
    [availableNations]
  );
  const activePlayerIds = Array.from({ length: normalizedPlayerCount }, (_, index) => String(index + 1));

  const updateMode = (nextMode: GameMode) => {
    setMode(nextMode);
    setPlayerCount(playerCountForMode(nextMode, playerCount));
  };

  const updateExpansions = (expansionId: ExpansionId) => {
    setEnabledExpansions((current) => {
      const next = toggleItem(current, expansionId);
      const nextNations = getNationOptions(next, privateData);
      const nextNationIds = new Set(nextNations.map((nation) => nation.id));
      setPlayerNationIds((nations) =>
        Object.fromEntries(
          Object.entries(nations).map(([playerId, nationId]) => [
            playerId,
            nextNationIds.has(nationId) ? nationId : firstNationId(nextNations)
          ])
        )
      );
      setSoloBotNationId((nationId) => nationId === "random" || nextNationIds.has(nationId) ? nationId : "random");
      return next;
    });
  };

  const startGame = () => {
    const options: GameOptions = {
      playerCount: normalizedPlayerCount,
      mode,
      enabledExpansions,
      enabledVariants,
      commonsSetId,
      ...(mode === "solo" ? { soloDifficulty } : {})
    };
    const selectedNations = Object.fromEntries(activePlayerIds.map((playerId) => [playerId, playerNationIds[playerId] ?? DEFAULT_NATION_ID]));

    onStart({
      options,
      playerNationIds: selectedNations,
      ...(mode === "solo" ? { soloBotNationId } : {}),
      ...(hasPrivateData(privateData) ? { privateData } : {})
    });
  };

  const importPrivateFiles = async (event: { target: HTMLInputElement }) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const result = await importPrivateDataFiles(files.map((file) => ({ name: file.name, text: () => file.text() })));
    setPrivateData(result.privateData);
    setPrivateFileStatuses(result.files);
    if (result.privateData.nations?.length) {
      const nextNations = getNationOptions(enabledExpansions, result.privateData);
      const nextNationIds = new Set(nextNations.map((nation) => nation.id));
      setPlayerNationIds((current) =>
        Object.fromEntries(
          activePlayerIds.map((playerId) => [
            playerId,
            nextNationIds.has(current[playerId]) ? current[playerId] : firstNationId(nextNations)
          ])
        )
      );
      setSoloBotNationId((nationId) => nationId === "random" || nextNationIds.has(nationId) ? nationId : "random");
    }
  };

  return (
    <main className="setup-screen">
      <section className="setup-panel" aria-labelledby="setup-title">
        <div className="setup-heading">
          <div>
            <p className="setup-kicker">Polity Engine setup</p>
            <h1 id="setup-title">New Game</h1>
          </div>
          <button className="primary-action" type="button" onClick={startGame}>
            Start Game
          </button>
        </div>

        <div className="setup-grid">
          <fieldset className="setup-section">
            <legend>Mode</legend>
            <div className="segmented-control">
              {modes.map((item) => (
                <button key={item.id} className={mode === item.id ? "is-active" : ""} type="button" onClick={() => updateMode(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup-section">
            <legend>Players</legend>
            <div className="segmented-control">
              {[1, 2, 3, 4].map((count) => (
                <button
                  key={count}
                  className={normalizedPlayerCount === count ? "is-active" : ""}
                  type="button"
                  disabled={mode !== "multiplayer" && count !== 1}
                  onClick={() => setPlayerCount(count as 1 | 2 | 3 | 4)}
                >
                  {count}
                </button>
              ))}
            </div>
          </fieldset>

          {mode === "solo" ? (
            <>
              <label className="setup-section setup-field">
                <span>Solo difficulty</span>
                <select value={soloDifficulty} onChange={(event: { target: HTMLSelectElement }) => setSoloDifficulty(event.target.value as SoloDifficulty)}>
                  {soloDifficulties.map((difficulty) => (
                    <option key={difficulty.id} value={difficulty.id}>
                      {difficulty.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="setup-section setup-field">
                <span>Bot nation</span>
                <select value={soloBotNationId} onChange={(event: { target: HTMLSelectElement }) => setSoloBotNationId(event.target.value)}>
                  <option value="random">Random</option>
                  {botNationOptions.map((nation) => (
                    <option key={nation.id} value={nation.id}>
                      {nation.label} - {nation.statusLabel}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          <label className="setup-section setup-field">
            <span>Commons set</span>
            <select value={commonsSetId} onChange={(event: { target: HTMLSelectElement }) => setCommonsSetId(event.target.value as CommonsSetId)}>
              {commonsSets.map((commonsSet) => (
                <option key={commonsSet.id} value={commonsSet.id}>
                  {commonsSet.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="setup-section">
            <legend>Expansions</legend>
            <div className="toggle-list">
              {expansions.map((expansion) => (
                <label key={expansion.id}>
                  <input type="checkbox" checked={enabledExpansions.includes(expansion.id)} onChange={() => updateExpansions(expansion.id)} />
                  <span>{expansion.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup-section setup-section--wide">
            <legend>Variants</legend>
            <div className="toggle-list toggle-list--grid">
              {variants.map((variant) => (
                <label key={variant.id}>
                  <input type="checkbox" checked={enabledVariants.includes(variant.id)} onChange={() => setEnabledVariants((current) => toggleItem(current, variant.id))} />
                  <span>{variant.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup-section setup-section--wide">
            <legend>Nations</legend>
            <div className="nation-grid">
              {activePlayerIds.map((playerId) => (
                <label key={playerId} className="setup-field">
                  <span>Player {playerId}</span>
                  <select value={playerNationIds[playerId] ?? DEFAULT_NATION_ID} onChange={(event: { target: HTMLSelectElement }) => setPlayerNationIds((current) => ({ ...current, [playerId]: event.target.value }))}>
                    {availableNations.map((nation) => (
                      <option key={nation.id} value={nation.id}>
                        {nation.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup-section setup-section--wide">
            <legend>Private Data</legend>
            <p className="setup-help">
              Upload generated JSON files such as cards.normalized.json and nations.normalized.json, or raw private CSV files such as imperium_cards_private.csv and imperium_nations_private.csv. Optional files include nation rulesets, nation strategy, bot state tables, and bot trade route tables.
              {" "}
              <a href="https://github.com/jcdaneshmand/polity-engine/blob/main/imperium-like-digital-prototype/docs/private-card-data-workflow.md#csv-and-json-schemas" target="_blank" rel="noreferrer">
                View the private data schema reference
              </a>
              .
            </p>
            <label className="setup-field">
              <span>Upload JSON or CSV files</span>
              <input type="file" multiple accept=".json,.csv,application/json,text/csv" onChange={importPrivateFiles} />
            </label>
            <button type="button" onClick={onOpenCardEntry}>
              Card Entry Tool
            </button>
            {privateFileStatuses.length ? (
              <div className="private-file-list">
                {privateFileStatuses.map((file) => (
                  <div key={file.name} className={`private-file-status private-file-status--${file.status}`}>
                    <strong>{file.name}</strong>
                    <span>{file.message}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </fieldset>
        </div>
        <p className="setup-attribution">
          Imperium: Classics, Imperium: Legends, and Imperium: Horizons are owned by Osprey Games. Visit the{" "}
          <a href="https://www.ospreypublishing.com/uk/discover/osprey-games/imperium/" target="_blank" rel="noreferrer">
            official Osprey Imperium page
          </a>
          . Polity Engine is an open-source, free, non-commercial fan project; view the{" "}
          <a href="https://github.com/jcdaneshmand/polity-engine" target="_blank" rel="noreferrer">
            GitHub repository
          </a>
          . It does not include copyrighted card text, artwork, logos, or other protected materials from those games.
        </p>
      </section>
    </main>
  );
}
