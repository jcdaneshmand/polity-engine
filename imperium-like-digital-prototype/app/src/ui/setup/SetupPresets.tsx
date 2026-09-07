import { useEffect, useState } from "react";
import { CURRENT_RULES_VERSION } from "../../../../engine/src/game/version";
import { inspectSetupPreset, readSetupPresetLibrary, SETUP_PRESETS_KEY, withSetupPresetLock, writeSetupPresetLibrary, type SetupPreset, type SetupPresetLibrary, type SetupPresetSettings } from "../../setupPresets";

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function summarizeSetupPresetChanges(current: SetupPresetSettings, next: SetupPresetSettings): string[] {
  const changes: string[] = [];
  if (current.mode !== next.mode) changes.push(`Mode: ${current.mode} to ${next.mode}`);
  if (current.playerCount !== next.playerCount) changes.push(`Players: ${current.playerCount} to ${next.playerCount}`);
  if (current.commonsSetId !== next.commonsSetId || !same(current.customCommonsCardIds, next.customCommonsCardIds)) changes.push(`Commons: ${current.commonsSetId} to ${next.commonsSetId}`);
  if (!same(current.playerNationIds, next.playerNationIds)) changes.push("Nations change");
  if (!same(current.enabledExpansions, next.enabledExpansions)) changes.push("Expansions change");
  if (!same(current.enabledVariants, next.enabledVariants)) changes.push("Variants change");
  if (current.replacementPolicy !== next.replacementPolicy) changes.push("Replacement policy changes");
  if (current.soloDifficulty !== next.soloDifficulty || current.soloBotNationId !== next.soloBotNationId) changes.push("Solo settings change");
  if (current.campaignMode !== next.campaignMode) changes.push("Campaign mode changes");
  return changes;
}

function downloadJson(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SetupPresets({ settings, onApply }: { settings: SetupPresetSettings; onApply: (settings: SetupPresetSettings) => void }) {
  const [library, setLibrary] = useState<SetupPresetLibrary>({ version: 1, revision: 0, presets: [] });
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [unappliedRaw, setUnappliedRaw] = useState<string | undefined>(undefined);
  const [damagedLibraryRaw, setDamagedLibraryRaw] = useState<string | undefined>(undefined);
  const current = library.presets.find((preset) => preset.id === selected);
  const duplicateNames = new Map<string, number>();
  for (const preset of library.presets) duplicateNames.set(preset.name, (duplicateNames.get(preset.name) ?? 0) + 1);
  const changes = current ? summarizeSetupPresetChanges(settings, current.settings) : [];
  const report = (error: unknown) => setMessage(error instanceof Error ? error.message : "Could not update setup presets.");

  const refresh = () => {
    setUnappliedRaw(undefined);
    const raw = localStorage.getItem(SETUP_PRESETS_KEY);
    try {
      setLibrary(readSetupPresetLibrary(localStorage));
      setDamagedLibraryRaw(undefined);
      setMessage("");
    } catch (error) {
      setDamagedLibraryRaw(raw ?? undefined);
      report(error);
    }
  };

  useEffect(() => {
    refresh();
    const listener = (event: StorageEvent) => { if (event.key === SETUP_PRESETS_KEY || event.key === null) refresh(); };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);

  const save = async (presets: SetupPreset[], nextSelected = selected, success = "Setup preset saved.") => {
    setBusy(true);
    try {
      const next = await withSetupPresetLock(() => writeSetupPresetLibrary(localStorage, library, presets));
      setLibrary(next);
      setSelected(nextSelected);
      setMessage(success);
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  const create = (title: string, nextSettings = settings) => {
    const setupPreset: SetupPreset = {
      version: 1,
      id: crypto.randomUUID(),
      name: title.trim(),
      rulesVersion: CURRENT_RULES_VERSION,
      settings: nextSettings
    };
    return save([...library.presets, setupPreset], setupPreset.id);
  };

  return (
    <details className="setup-presets" data-qa="setup-presets">
      <summary>Setup Presets</summary>
      <fieldset disabled={busy}>
        <div className="setup-presets__primary">
          <label className="setup-field"><span>Preset name</span><input maxLength={80} value={name} onChange={(event: { target: HTMLInputElement }) => setName(event.target.value)} /></label>
          <button type="button" disabled={!name.trim()} onClick={() => void create(name)}>Save Setup</button>
          <label className="setup-field"><span>Saved setup</span><select value={selected} onChange={(event: { target: HTMLSelectElement }) => {
            setSelected(event.target.value);
            setName(library.presets.find((preset) => preset.id === event.target.value)?.name ?? "");
          }}><option value="">Choose setup</option>{library.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}{(duplicateNames.get(preset.name) ?? 0) > 1 ? ` (${preset.id.slice(0, 8)})` : ""}</option>)}</select></label>
          <button type="button" disabled={!current} onClick={() => {
            if (!current) return;
            onApply(current.settings);
            setMessage("Setup preset applied.");
          }}>Apply Preset</button>
        </div>
        {current ? <div className="setup-preset-preview" aria-label="Preset change preview">
          <strong>{changes.length ? `${changes.length} setting groups will change` : "This setup already matches"}</strong>
          {changes.length ? <span>{changes.join(" / ")}</span> : null}
        </div> : null}
        <details className="setup-presets__manage">
          <summary>Manage Presets</summary>
          <div className="setup-presets__actions">
            <button type="button" disabled={!current || !name.trim()} onClick={() => void save(library.presets.map((preset) => preset.id === selected ? { ...preset, name: name.trim() } : preset), selected, "Setup preset renamed.")}>Rename</button>
            <button type="button" disabled={!current} onClick={() => current && void create(`${current.name.slice(0, 75)} copy`, current.settings)}>Duplicate</button>
            <button type="button" disabled={!current} onClick={() => { if (current && window.confirm(`Replace ${current.name} with the current setup?`)) void save(library.presets.map((preset) => preset.id === selected ? { ...preset, settings } : preset), selected, "Setup preset replaced."); }}>Replace</button>
            <button type="button" disabled={!current} onClick={() => { if (current && window.confirm(`Delete ${current.name}?`)) void save(library.presets.filter((preset) => preset.id !== selected), "", "Setup preset deleted."); }}>Delete</button>
            <button type="button" disabled={!current} onClick={() => current && downloadJson("polity-setup-preset.json", JSON.stringify(current))}>Export</button>
            <label className="file-action">Import<input type="file" accept=".json,application/json" onChange={(event: { currentTarget: HTMLInputElement }) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              setBusy(true);
              void file.text().then((raw) => {
                const inspection = inspectSetupPreset(raw);
                if (inspection.kind === "valid") return create(inspection.preset.name, inspection.preset.settings);
                if (inspection.kind === "incompatible") {
                  setUnappliedRaw(inspection.raw);
                  setMessage(`${inspection.reason} It was not applied or added.`);
                  return undefined;
                }
                throw new Error(inspection.reason);
              }).catch(report).finally(() => setBusy(false));
            }} /></label>
            <button type="button" onClick={refresh}>Refresh</button>
            {unappliedRaw ? <button type="button" onClick={() => downloadJson("polity-setup-preset-unapplied.json", unappliedRaw)}>Export Unapplied File</button> : null}
            {damagedLibraryRaw ? <button type="button" onClick={() => downloadJson("polity-setup-presets-recovery.json", damagedLibraryRaw)}>Export Raw Library</button> : null}
          </div>
        </details>
      </fieldset>
      <p role="status">{message}</p>
    </details>
  );
}
