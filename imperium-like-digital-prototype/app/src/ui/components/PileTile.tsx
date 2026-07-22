export function PileTile({ label, count, disabled, selected, zoneKind, zoneRole, onSelect }: { label: string; count: number; disabled?: boolean; selected?: boolean; zoneKind?: string; zoneRole?: string; onSelect?: () => void }) {
  return <button
    className={`pile-tile ${disabled ? "is-disabled" : ""} ${selected ? "is-selected" : ""}`}
    onClick={onSelect}
    disabled={disabled}
    data-zone-kind={zoneKind}
    data-zone-role={zoneRole}
    data-zone-state={selected ? "selected" : disabled ? "empty" : "selectable"}
    aria-current={selected ? "true" : undefined}
    aria-label={`${label} - ${count} ${count === 1 ? "card" : "cards"}`}
  >
    <span>{label}</span>
    <strong>{count}</strong>
  </button>;
}
