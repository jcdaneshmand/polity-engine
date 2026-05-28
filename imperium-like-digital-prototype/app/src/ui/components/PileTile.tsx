export function PileTile({ label, count, disabled, onSelect }: { label: string; count: number; disabled?: boolean; onSelect?: () => void }) {
  return <button className={`pile-tile ${disabled ? "is-disabled" : ""}`} onClick={onSelect} disabled={disabled}><span>{label}</span><strong>{count}</strong></button>;
}
