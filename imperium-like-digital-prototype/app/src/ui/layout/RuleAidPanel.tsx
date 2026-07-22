import { useEffect, useState } from "react";
import { visibleRuleAidItems } from "./ruleAidContent";

const PLAYER_AID_STORAGE_KEY = "polity-player-aid-expanded-v1";

function initialPlayerAidExpanded(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(PLAYER_AID_STORAGE_KEY) !== "false";
}

export function RuleAidPanel({ G, pending, selectedCard }: { G: any; pending?: any; selectedCard?: any }) {
  const items = visibleRuleAidItems({ G, pending, selectedCard });
  const hasUrgentAid = Boolean(pending);
  const [expanded, setExpanded] = useState<boolean>(initialPlayerAidExpanded());

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PLAYER_AID_STORAGE_KEY, expanded ? "true" : "false");
  }, [expanded]);

  const visibleItems = expanded ? items : items.filter((item) => item.id === "pending" && hasUrgentAid);

  return (
    <section className="panel rule-aid-panel" aria-label="Player aid" data-qa="player-aid" data-expanded={expanded ? "true" : "false"}>
      <div className="rule-aid-heading">
        <div className="panel-title">Player Aid</div>
        <button className="panel-toggle-button" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {visibleItems.length > 0 ? <div className="rule-aid-list">
        {visibleItems.map((item) => (
          <div className="rule-aid-item" key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </div>
        ))}
      </div> : <div className="rule-aid-compact">Reference aid is collapsed.</div>}
    </section>
  );
}
