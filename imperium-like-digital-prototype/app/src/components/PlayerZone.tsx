export function PlayerZone({ label, count }: { label: string; count: number }) {
  return <div className="zone"><span>{label}</span><strong>{count}</strong></div>;
}
