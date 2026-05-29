export function PileTile({ label, count, disabled, selected, onSelect }: { label: string; count: number; disabled?: boolean; selected?: boolean; onSelect?: () => void }) {
  return <button className={`pile-tile ${disabled ? "is-disabled" : ""} ${selected ? "is-selected" : ""}`} onClick={onSelect} disabled={disabled}>
    <span>{label}</span>
    <strong>{count}</strong>
  </button>;
}
