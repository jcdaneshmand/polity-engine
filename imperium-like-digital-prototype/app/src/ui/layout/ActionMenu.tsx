import { getActionIntent, ruleProvenanceLabels } from "../controller/selectionModel";

type ActionItem = { kind: "action"; label: string; action: any };
type GroupItem = { kind: "group"; label: string; actions: any[] };
type SectionItem = { kind: "section"; label: string; items: Array<ActionItem | GroupItem> };
type MenuItem = ActionItem | GroupItem | SectionItem;

function isRequiredChoice(action: any): boolean {
  return String(action.action).startsWith("resolve") || String(action.action).startsWith("skip");
}

function sectionForAction(action: any): string {
  if (isRequiredChoice(action)) return "Required Choices";
  if (action.enabled) return "Available Actions";
  return "Unavailable";
}

export function compactReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  if (reason === "Innovate requires starting from an Activate turn") return "Needs Activate turn";
  if (reason === "Revolt requires starting from an Activate turn") return "Needs Activate turn";
  const pending = reason.match(/^Resolve the pending (.+) choice first$/);
  if (pending) return `Resolve ${pending[1]} first`;
  if (reason === "Resolve cleanup discard first") return "Resolve cleanup first";
  if (reason === "Resolve cleanup market resource first") return "Resolve cleanup first";
  return reason;
}

export function groupActionsForMenu(actions: any[]): MenuItem[] {
  const sections: SectionItem[] = [];
  const sectionByLabel = new Map<string, SectionItem>();
  const groups = new Map<string, GroupItem>();
  const getSection = (label: string) => {
    let section = sectionByLabel.get(label);
    if (!section) {
      section = { kind: "section", label, items: [] };
      sectionByLabel.set(label, section);
      sections.push(section);
    }
    return section;
  };
  const orderedActions = [
    ...actions.filter((action) => isRequiredChoice(action)),
    ...actions.filter((action) => !isRequiredChoice(action) && action.enabled),
    ...actions.filter((action) => !isRequiredChoice(action) && !action.enabled)
  ];
  orderedActions.forEach((action) => {
    const section = getSection(sectionForAction(action));
    if (!action.group) {
      section.items.push({ kind: "action", label: action.label, action });
      return;
    }
    const groupKey = `${section.label}:${action.group}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { kind: "group", label: action.group, actions: [] };
      groups.set(groupKey, group);
      section.items.push(group);
    }
    group.actions.push(action);
  });
  return sections;
}

function actionSymbol(action: any): string {
  if (String(action.action).startsWith("resolve")) return "OK";
  if (String(action.action).startsWith("skip")) return "SKIP";
  if (action.action === "play") return "PLAY";
  if (action.action === "profit") return "+";
  if (action.action === "view") return "VIEW";
  if (action.action === "exhaust") return "EXH";
  if (action.action === "endTurn") return "NEXT";
  if (action.action === "cancel") return "X";
  return "ACT";
}

export function ActionMenu({ actions, onAction }: { actions: any[]; onAction: (a:any)=>void }) {
  const menuItems = groupActionsForMenu(actions);
  const hasEnabledActions = actions.some((action) => action.enabled);
  const renderButton = (a: any) => <button key={a.label} className={`action-button action-button--${getActionIntent(a)}`} disabled={!a.enabled} title={a.reason || ""} onClick={()=>onAction(a)}>
    <span className="action-button-main">
      <span className="action-symbol" aria-hidden="true">{actionSymbol(a)}</span>
      <span>{a.label}</span>
    </span>
    {a.provenance ? <span className="action-provenance">{ruleProvenanceLabels[a.provenance as keyof typeof ruleProvenanceLabels] ?? "Rule"}</span> : null}
    {!a.enabled ? <small>{compactReason(a.reason) || "Unavailable"}</small> : null}
  </button>;

  return <div className="panel actions action-menu">
    <div className="panel-title">Actions</div>
    {actions.length === 0 ? <div className="action-empty">Select a card or zone to see actions.</div> : null}
    {menuItems.map((section) => section.kind === "section" ? <section key={section.label} className="action-section">
      <div className="action-section-title">{section.label}</div>
      {section.label === "Available Actions" && section.items.length === 0 ? <div className="action-empty">No available actions.</div> : null}
      {section.items.map((item) => item.kind === "action"
        ? renderButton(item.action)
        : <details key={item.label} className="action-group" open={section.label !== "Unavailable" || !hasEnabledActions}>
          <summary>{item.label}</summary>
          <div className="action-group-items">
            {item.actions.map(renderButton)}
          </div>
        </details>)}
    </section> : null)}
  </div>;
}
