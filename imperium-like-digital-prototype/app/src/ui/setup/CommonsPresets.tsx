import { useEffect, useState } from "react";
import { COMMONS_PRESETS_KEY, commonsComposition, parseCommonsPreset, readCommonsPresets, writeCommonsPresets, withCommonsPresetLock, type CommonsPreset } from "../../commonsPresets";

export default function CommonsPresets({ ids, cards, onSelect }: { ids: string[]; cards: Array<{ id: string; group: string }>; onSelect: (ids: string[]) => void }) {
  const [presets, setPresets] = useState<CommonsPreset[]>([]);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const report = (error: unknown) => setMessage(error instanceof Error ? error.message : "Could not save preset.");
  const refresh = () => { try { const raw = localStorage.getItem(COMMONS_PRESETS_KEY); setPresets(readCommonsPresets(raw)); setSnapshot(raw); } catch (error) { report(error); } };
  useEffect(() => {
    refresh();
    const listener = (event: StorageEvent) => { if (event.key === COMMONS_PRESETS_KEY || event.key === null) refresh(); };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  const save = async (next: CommonsPreset[], nextSelected = selected) => {
    setBusy(true);
    try {
      const raw = await withCommonsPresetLock(() => writeCommonsPresets(localStorage, snapshot, next));
      setPresets(next); setSnapshot(raw); setSelected(nextSelected); setMessage("Preset saved.");
    } catch (error) { report(error); }
    finally { setBusy(false); }
  };
  const current = presets.find((p) => p.id === selected);
  const composition = commonsComposition(ids, cards);
  const create = (cardIds: string[], title: string) => {
    const preset: CommonsPreset = { version: 1, id: crypto.randomUUID(), name: title.trim(), cardIds: [...cardIds], setId: "custom" };
    return save([...presets, preset], preset.id);
  };
  return <div data-qa="commons-presets">
    <fieldset className="private-data-actions preset-actions" disabled={busy} aria-label="Preset actions">
      <label>Preset name <input maxLength={80} value={name} onChange={(event: { target: HTMLInputElement }) => setName(event.target.value)} /></label>
      <button type="button" disabled={!composition.valid || !name.trim()} onClick={() => create(ids, name)}>Save Preset</button>
      <label>Commons preset <select aria-label="Commons preset" value={selected} onChange={(event: { target: HTMLSelectElement }) => { setSelected(event.target.value); setName(presets.find((p) => p.id === event.target.value)?.name ?? ""); }}>
        <option value="">Choose preset</option>{presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <button type="button" disabled={!current} onClick={() => current && onSelect([...current.cardIds])}>Load Preset</button>
      <button type="button" disabled={!current || !name.trim()} onClick={() => save(presets.map((p) => p.id === selected ? { ...p, name: name.trim() } : p))}>Rename Preset</button>
      <button type="button" disabled={!current} onClick={() => current && create(current.cardIds, `${current.name.slice(0, 75)} copy`)}>Duplicate Preset</button>
      <button type="button" disabled={!current || !composition.valid} onClick={() => { if (current && window.confirm(`Replace ${current.name} with this selection?`)) save(presets.map((p) => p.id === selected ? { ...p, cardIds: [...ids] } : p)); }}>Replace Preset</button>
      <button type="button" disabled={!current} onClick={() => { if (current && window.confirm(`Delete ${current.name}?`)) void save(presets.filter((p) => p.id !== selected), ""); }}>Delete Preset</button>
      <button type="button" disabled={!current} onClick={() => {
        if (!current) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(current)], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = "polity-commons-preset.json"; link.click(); URL.revokeObjectURL(url);
      }}>Export Preset</button>
      <label className="file-action">Import Preset<input type="file" accept=".json,application/json" onChange={(event: { currentTarget: HTMLInputElement }) => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
        if (!file) return;
        setBusy(true);
        void file.text().then((raw) => { const preset = parseCommonsPreset(raw); return create(preset.cardIds, preset.name); }).catch(report).finally(() => setBusy(false));
      }} /></label>
      <button type="button" onClick={() => { setMessage(""); refresh(); }}>Refresh Presets</button>
    </fieldset>
    <p>{ids.length} selected{Object.entries(composition.groups).map(([group, count]) => ` / ${group}: ${count}`).join("")}</p>
    {composition.missing.length ? <div role="alert"><p>{composition.missing.length} selected cards are unavailable with the current data.</p><button type="button" onClick={() => onSelect(ids.filter((id) => !composition.missing.includes(id)))}>Remove Unavailable Cards</button></div> : null}
    {!ids.length ? <p>Select cards before starting a custom game.</p> : null}
    <p role="status">{message}</p>
  </div>;
}
