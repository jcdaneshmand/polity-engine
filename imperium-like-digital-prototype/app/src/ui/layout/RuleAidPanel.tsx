import { visibleRuleAidItems } from "./ruleAidContent";

export function RuleAidPanel({ G, pending, selectedCard }: { G: any; pending?: any; selectedCard?: any }) {
  const items = visibleRuleAidItems({ G, pending, selectedCard });

  return (
    <section className="panel rule-aid-panel" aria-label="Player aid">
      <div className="panel-title">Player Aid</div>
      <div className="rule-aid-list">
        {items.map((item) => (
          <div className="rule-aid-item" key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
