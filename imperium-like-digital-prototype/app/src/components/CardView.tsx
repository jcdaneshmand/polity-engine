export function CardView({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="card"><strong>{title}</strong><div>{children}</div></div>;
}
