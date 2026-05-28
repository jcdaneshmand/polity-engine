export function TokenBadge({ label, value }: { label: string; value: string | number }) { return <div className="badge token"><span>{label}</span><strong>{value}</strong></div>; }
