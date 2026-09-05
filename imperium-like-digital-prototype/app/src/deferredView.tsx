import { useEffect, useState } from "react";

export function deferredView<P extends object>(load: () => Promise<{ default: (props: P) => any }>) {
  let cached: ((props: P) => any) | undefined;
  return function DeferredView(props: P) {
    const [View, setView] = useState<((props: P) => any) | undefined>(undefined);
    const [attempt, setAttempt] = useState(0);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (cached) { setView(() => cached); return; }
      let active = true;
      setFailed(false);
      void load().then((module) => {
        cached = module.default;
        if (active) setView(() => module.default);
      }).catch(() => { if (active) setFailed(true); });
      return () => { active = false; };
    }, [attempt]);
    if (View) return <View {...props} />;
    return <div className="deferred-view" aria-busy={!failed}>
      <p role="status">{failed ? "This screen could not be loaded." : "Loading..."}</p>
      {failed ? <div>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        <button type="button" onClick={() => window.location.reload()}>Reload App</button>
      </div> : null}
    </div>;
  };
}
