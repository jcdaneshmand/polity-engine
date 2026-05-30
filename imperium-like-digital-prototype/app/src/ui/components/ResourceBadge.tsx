import { useEffect, useState } from "react";

export function ResourceBadge({ label, value }: { label: string; value: number }) {
  const [previous, setPrevious] = useState(value);
  const [gained, setGained] = useState(false);

  useEffect(() => {
    if (value > previous) {
      setGained(false);
      requestAnimationFrame(() => setGained(true));
      const timeout = window.setTimeout(() => setGained(false), 900);
      setPrevious(value);
      return () => window.clearTimeout(timeout);
    }
    if (value !== previous) setPrevious(value);
    return undefined;
  }, [previous, value]);

  return <div className={`badge ${gained ? "is-gain" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
