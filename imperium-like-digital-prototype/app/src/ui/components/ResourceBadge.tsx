export function ResourceBadge({ label, value }: { label: string; value: number }) { return <div className="badge"><span>{label}</span><strong>{value}</strong></div>; }
