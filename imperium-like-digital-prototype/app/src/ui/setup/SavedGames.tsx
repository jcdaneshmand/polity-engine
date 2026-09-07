import { useEffect, useState } from "react";
import { CURRENT_RULES_VERSION, importLocalGameExport, type SavedLocalGameEnvelope } from "../../localGameSave";
import { migrateLegacySave, readRawSaveLibrary, readSaveLibrary, resetSaveLibraryAfterBackup, SAVE_LIBRARY_KEY, withSaveLibraryLock, writeSaveLibrary, type SaveLibrary, type SaveSlot } from "../../saveLibrary";

export default function SavedGames({ autosave, onResume }: { autosave?: SavedLocalGameEnvelope; onResume: (save: SavedLocalGameEnvelope) => void }) {
  const [library, setLibrary] = useState<SaveLibrary>({ version: 2, stateVersion: 1, rulesVersion: CURRENT_RULES_VERSION, revision: 0, slots: [] });
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [libraryRaw, setLibraryRaw] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const report = (error: unknown) => setMessage(error instanceof Error ? error.message : "Could not update saved games.");
  const refresh = async () => {
    setBusy(true);
    let readable = false;
    try {
      setLibraryRaw(readRawSaveLibrary(localStorage));
      const next = await withSaveLibraryLock(() => {
        const current = readSaveLibrary(localStorage);
        setLibrary(current); setReady(true); readable = true;
        return migrateLegacySave(localStorage);
      });
      setLibrary(next); setLibraryRaw(next.rawSource ?? readRawSaveLibrary(localStorage)); setReady(true);
    } catch (error) { if (!readable) setReady(false); report(error); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    void refresh();
    const listener = (event: StorageEvent) => {
      if (event.key === SAVE_LIBRARY_KEY || event.key === null) {
        void refresh();
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  const mutate = async (update: (slots: SaveSlot[]) => SaveSlot[]) => {
    setBusy(true);
    try {
      await withSaveLibraryLock(() => {
        const next = writeSaveLibrary(localStorage, library, update(library.slots));
        setLibrary(next);
        setLibraryRaw(next.rawSource ?? readRawSaveLibrary(localStorage));
      });
      setMessage("Saved games updated.");
      return true;
    } catch (error) { report(error); return false; }
    finally { setBusy(false); }
  };
  const named = (save: SavedLocalGameEnvelope, title: string) => ({ ...save, metadata: { ...save.metadata, slotName: title.trim().slice(0, 80) } });
  const add = (save: SavedLocalGameEnvelope, title: string) => {
    if (!title.trim()) { setMessage("Enter a save name."); return; }
    return mutate((slots) => [...slots, { id: crypto.randomUUID(), envelope: named(save, title) }]);
  };
  const downloadContent = (content: string, fileName: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url);
  };
  const download = (save: SavedLocalGameEnvelope) => downloadContent(
    JSON.stringify(save),
    `polity-${save.metadata.slotName.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60) || "saved-game"}.json`
  );
  return <section className="setup-section setup-section--wide" aria-label="Saved games" data-qa="save-library">
    <h2>Saved Games</h2>
    <div className="private-data-actions">
      <label>Save name <input maxLength={80} value={name} onChange={(event: { target: HTMLInputElement }) => setName(event.target.value)} /></label>
      <button type="button" disabled={!autosave || busy || !ready || !name.trim()} onClick={() => { if (autosave) void add(autosave, name); }}>Save Copy</button>
      <label className="file-action">Import Into Library<input type="file" accept=".json,application/json" disabled={busy || !ready} onChange={(event: { currentTarget: HTMLInputElement }) => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
        if (!file) return;
        setBusy(true);
        void file.text().then(async (raw) => {
          const result = importLocalGameExport(raw);
          if (result.kind !== "valid") throw new Error(result.reason);
          await add(result.envelope, name.trim() || result.envelope.metadata.slotName);
        }).catch(report).finally(() => setBusy(false));
      }} /></label>
      <button type="button" disabled={busy} onClick={() => { setMessage(""); void refresh(); }}>Refresh Saved Games</button>
      {libraryRaw ? <button type="button" onClick={() => downloadContent(libraryRaw, "polity-save-library-original.json")}>Export Raw Library</button> : null}
      {!ready && libraryRaw ? <button type="button" disabled={busy} onClick={() => {
        if (!window.confirm("Reset the unreadable saved-game library? Its exact bytes will remain in the recovery backup key.")) return;
        try { resetSaveLibraryAfterBackup(localStorage); setMessage("Unreadable library backed up and reset."); void refresh(); } catch (error) { report(error); }
      }}>Back Up and Reset Library</button> : null}
    </div>
    {library.slots.map((slot) => <article key={slot.id} className="saved-game-row" data-qa="save-slot">
      <strong>{slot.envelope.metadata.slotName}</strong>
      <span>{slot.envelope.metadata.mode} / Round {slot.envelope.metadata.round ?? "?"} / {new Date(slot.envelope.savedAtIso).toLocaleString()}</span>
      {!slot.envelope.snapshotSource ? <span>Legacy snapshot: hidden deck completeness is unverified.</span> : null}
      <div className="private-data-actions">
        <button type="button" disabled={busy} onClick={() => onResume(slot.envelope)}>Resume</button>
        <button type="button" disabled={busy || !ready} onClick={() => { setRenaming(slot.id); setRenameValue(slot.envelope.metadata.slotName); }}>Rename</button>
        <button type="button" disabled={busy || !ready} onClick={() => { void add(slot.envelope, `${slot.envelope.metadata.slotName.slice(0, 75)} copy`); }}>Duplicate</button>
        <button type="button" onClick={() => download(slot.envelope)}>Export</button>
        <button type="button" disabled={!autosave || busy} onClick={() => { if (autosave && window.confirm(`Replace ${slot.envelope.metadata.slotName} with the current autosave?`)) void mutate((slots) => slots.map((s) => s.id === slot.id ? { ...s, envelope: named(autosave, s.envelope.metadata.slotName) } : s)); }}>Replace</button>
        <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete ${slot.envelope.metadata.slotName}?`)) void mutate((slots) => slots.filter((s) => s.id !== slot.id)); }}>Delete</button>
      </div>
      {renaming === slot.id ? <form className="private-data-actions" onSubmit={(event: { preventDefault: () => void }) => {
        event.preventDefault();
        if (!renameValue.trim() || busy || !ready) return;
        void mutate((slots) => slots.map((s) => s.id === slot.id ? { ...s, envelope: named(s.envelope, renameValue) } : s)).then((ok) => { if (ok) setRenaming(null); });
      }}>
        <label>New save name <input autoFocus maxLength={80} value={renameValue} onChange={(event: { target: HTMLInputElement }) => setRenameValue(event.target.value)} /></label>
        <button type="submit" disabled={busy || !ready || !renameValue.trim()}>Save Name</button>
        <button type="button" onClick={() => setRenaming(null)}>Cancel Rename</button>
      </form> : null}
    </article>)}
    {(library.recoverableSlots ?? []).map((slot) => <article key={`recovery-${slot.sourceIndex}`} className="saved-game-row" data-qa="recoverable-save-slot">
      <strong>{slot.summary.slotName}</strong>
      <span>{slot.kind.replace(/-/g, " ")} / Rules {slot.summary.rulesVersion ?? "?"} / {slot.summary.savedAtIso ? new Date(slot.summary.savedAtIso).toLocaleString() : "Unknown date"}</span>
      <span>{slot.reason}</span>
      <div className="private-data-actions">
        <button type="button" onClick={() => downloadContent(JSON.stringify(slot.storedSlot), `polity-reconstructed-slot-${slot.sourceIndex + 1}.json`)}>Export Stored Slot</button>
      </div>
    </article>)}
    <p role="status">{message}</p>
  </section>;
}
