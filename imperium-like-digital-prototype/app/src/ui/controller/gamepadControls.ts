export type PadCommand = "previous" | "next" | "decrease" | "increase" | "confirm" | "cancel" | "details" | "actions" | "previousZone" | "nextZone" | "endTurn";
type Pad = Pick<Gamepad, "buttons" | "axes" | "connected" | "mapping">;
export function gamepadCommand(pad: Pad | null): PadCommand | null {
  if (!pad?.connected || pad.mapping !== "standard") return null;
  const down = (index: number) => Boolean(pad.buttons[index]?.pressed);
  if (down(1)) return "cancel";
  if (down(0)) return "confirm";
  if (down(2)) return "details";
  if (down(3)) return "actions";
  if (down(4)) return "previousZone";
  if (down(5)) return "nextZone";
  if (down(9)) return "endTurn";
  if (down(12) || pad.axes[1] < -0.6) return "previous";
  if (down(13) || pad.axes[1] > 0.6) return "next";
  if (down(14) || pad.axes[0] < -0.6) return "decrease";
  if (down(15) || pad.axes[0] > 0.6) return "increase";
  return null;
}

export function createPadRepeater() {
  let previous: PadCommand | null = null;
  let nextAt = 0;
  return (command: PadCommand | null, now: number): PadCommand | null => {
    if (!command) { previous = null; return null; }
    if (command !== previous) { previous = command; nextAt = now + 400; return command; }
    if (["previous", "next", "decrease", "increase", "previousZone", "nextZone"].includes(command) && now >= nextAt) { nextAt = now + 150; return command; }
    return null;
  };
}

export function focusableElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
    .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled, [aria-disabled="true"]')
      && !element.closest('[inert], [hidden]') && element.getClientRects().length > 0);
}

export function applyPadCommand(command: PadCommand): void {
  const modal = document.querySelector<HTMLElement>('[aria-modal="true"]');
  const active = document.activeElement as HTMLElement | null;
  if (modal && (!active || !modal.contains(active))) {
    if (command === "cancel") modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    else focusableElements(modal)[0]?.focus();
    return;
  }
  if (command === "cancel") {
    (active ?? window).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    return;
  }
  if (command === "confirm") {
    if (active && !active.matches(':disabled, [aria-disabled="true"]') && !active.closest('[inert], [hidden]')) active.click();
    return;
  }
  if (command === "details") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true }));
    return;
  }
  if (command === "actions") {
    document.querySelector<HTMLElement>('.action-menu button:not(:disabled)')?.focus();
    return;
  }
  if (command === "endTurn") {
    document.querySelector<HTMLElement>('[data-action="endTurn"]:not(:disabled)')?.click();
    return;
  }
  if (command === "previousZone" || command === "nextZone") {
    const controls = Array.from(document.querySelectorAll<HTMLElement>('.left button:not(:disabled)'))
      .filter((element) => element.getClientRects().length > 0);
    if (!controls.length) return;
    const index = controls.indexOf(active!);
    const direction = command === "nextZone" ? 1 : -1;
    const next = controls[index < 0 ? (direction > 0 ? 0 : controls.length - 1) : (index + direction + controls.length) % controls.length];
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
    return;
  }
  if (active instanceof HTMLSelectElement && !active.disabled && (command === "increase" || command === "decrease")) {
    const options = Array.from(active.options).filter((option) => !option.disabled && !option.closest('optgroup:disabled'));
    const index = options.findIndex((option) => option.value === active.value);
    const next = options[index + (command === "increase" ? 1 : -1)];
    if (next) { active.value = next.value; active.dispatchEvent(new Event("change", { bubbles: true })); }
    return;
  }
  const elements = focusableElements(modal ?? document);
  if (!elements.length) return;
  const index = elements.indexOf(active!);
  const next = elements[index < 0 ? 0 : (index + (["next", "increase"].includes(command) ? 1 : -1) + elements.length) % elements.length];
  next.focus(); next.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function startGamepadNavigation(): () => void {
  const repeat = createPadRepeater();
  let frame = 0;
  let lastPadIndex: number | undefined;
  const tick = () => {
    const pad = document.visibilityState === "visible" ? Array.from(navigator.getGamepads?.() ?? []).find((item) => item?.connected && item.mapping === "standard") : null;
    if (lastPadIndex !== pad?.index) repeat(null, performance.now());
    lastPadIndex = pad?.index;
    const command = repeat(gamepadCommand(pad ?? null), performance.now());
    if (command) applyPadCommand(command);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}
