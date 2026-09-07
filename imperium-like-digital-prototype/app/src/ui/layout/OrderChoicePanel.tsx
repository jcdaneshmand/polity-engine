import { useEffect, useMemo, useRef, useState } from "react";
import { getOrderChoiceModel, isExactOrder, moveOrderItem, reconcileOrder } from "../controller/orderComposer";

function cardLabel(G: any, cardId: string): string {
  return G?.cardDb?.[cardId]?.displayName ?? cardId;
}

export function OrderChoicePanel({ G, viewerId, onAction }: { G: any; viewerId: string; onAction: (action: any) => void }) {
  const model = getOrderChoiceModel(G);
  const modelKey = model?.key ?? "none";
  const [takeCardId, setTakeCardId] = useState<string | undefined>(model?.kind === "look_take" ? model.cardIds[0] : undefined);
  const expectedOrder = useMemo(
    () => model ? model.cardIds.filter((cardId) => model.kind !== "look_take" || cardId !== takeCardId) : [],
    [modelKey, model, takeCardId]
  );
  const [order, setOrder] = useState<string[]>(expectedOrder);
  const panelRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!model) return;
    setTakeCardId((previous) => model.kind === "look_take" && previous && model.cardIds.includes(previous) ? previous : model.kind === "look_take" ? model.cardIds[0] : undefined);
  }, [modelKey]);

  useEffect(() => {
    setOrder((previous) => reconcileOrder(previous, expectedOrder));
  }, [modelKey, expectedOrder.join("|")]);

  useEffect(() => {
    if (!model) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const target = returnFocusRef.current;
      if (target?.isConnected) requestAnimationFrame(() => target.focus());
    };
  }, [modelKey]);

  if (!model) return null;
  const ownsChoice = model.playerId === viewerId;
  const valid = ownsChoice && (model.kind !== "look_take" || Boolean(takeCardId)) && isExactOrder(order, expectedOrder);
  const submit = () => {
    if (!valid) return;
    if (model.kind === "look_take") onAction({ action: model.resolveAction, enabled: true, cardId: takeCardId, returnOrder: [...order] });
    else onAction({ action: model.resolveAction, enabled: true, cardIds: [...order] });
  };
  const reset = () => setOrder([...expectedOrder]);

  return <section
    ref={panelRef}
    className="panel order-choice-panel"
    aria-label={model.title}
    data-qa="order-choice-panel"
    data-order-kind={model.kind}
    data-order-size={model.cardIds.length}
    onKeyDown={(event: { key: string; preventDefault: () => void }) => {
      if (event.key === "Escape") {
        event.preventDefault();
        reset();
      }
    }}
  >
    <div className="panel-title">{model.title}</div>
    {!ownsChoice ? <p role="status">Waiting for player {model.playerId}.</p> : <>
      {model.kind === "look_take" ? <div className="take-choice" role="group" aria-label="Card to take">
        {model.cardIds.map((cardId) => <button
          key={cardId}
          type="button"
          className={takeCardId === cardId ? "is-selected" : undefined}
          aria-pressed={takeCardId === cardId}
          onClick={() => setTakeCardId(cardId)}
        >Take {cardLabel(G, cardId)}</button>)}
      </div> : null}
      <ol className="order-choice-list" aria-label="Current card order">
        {order.map((cardId, index) => <li key={cardId}>
          <span><strong>{index + 1}</strong> {cardLabel(G, cardId)}</span>
          <span className="order-choice-controls">
            <button type="button" aria-label={`Move ${cardLabel(G, cardId)} up`} title="Move up" disabled={index === 0} onClick={() => setOrder((current) => moveOrderItem(current, index, -1))}>
              <span aria-hidden="true">&#8593;</span>
            </button>
            <button type="button" aria-label={`Move ${cardLabel(G, cardId)} down`} title="Move down" disabled={index === order.length - 1} onClick={() => setOrder((current) => moveOrderItem(current, index, 1))}>
              <span aria-hidden="true">&#8595;</span>
            </button>
          </span>
        </li>)}
      </ol>
      <div className="order-choice-actions">
        <button type="button" onClick={reset}>Reset order</button>
        <button type="button" className="primary-action" disabled={!valid} onClick={submit}>{model.submitLabel}</button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{order.map((cardId) => cardLabel(G, cardId)).join(", then ")}</span>
    </>}
  </section>;
}
