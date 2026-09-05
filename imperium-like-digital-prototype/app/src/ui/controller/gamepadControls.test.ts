import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPadCommand, createPadRepeater, gamepadCommand } from "./gamepadControls";
const pad = (pressed = -1, axes = [0, 0]) => ({ connected: true, mapping: "standard" as const, axes, buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: index === pressed, value: index === pressed ? 1 : 0, touched: false })) });
describe("standard gamepad controls", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("does not activate aria-disabled controls", () => {
    const click = vi.fn();
    vi.stubGlobal("document", { querySelector: () => null, activeElement: { matches: () => true, click } });
    applyPadCommand("confirm");
    expect(click).not.toHaveBeenCalled();
  });
  it("recovers focus into a modal before acting on a background select", () => {
    const focus = vi.fn();
    const control = { tabIndex: 0, matches: () => false, closest: () => null, getClientRects: () => [1], focus };
    const background = { value: "unchanged" };
    vi.stubGlobal("document", { activeElement: background, querySelector: () => ({ contains: () => false, querySelectorAll: () => [control] }) });
    applyPadCommand("increase");
    expect(background.value).toBe("unchanged");
    expect(focus).toHaveBeenCalledOnce();
  });
  it("maps buttons and respects dead zones and disconnects", () => {
    expect(gamepadCommand(pad(0))).toBe("confirm");
    expect(gamepadCommand(pad(1))).toBe("cancel");
    expect(gamepadCommand(pad(13))).toBe("next");
    expect(gamepadCommand(pad(-1, [0.2, -0.3]))).toBeNull();
    expect(gamepadCommand(pad(-1, [-0.8, 0]))).toBe("decrease");
    expect(gamepadCommand({ ...pad(0), connected: false })).toBeNull();
  });
  it("limits navigation repeats and never repeats confirmation", () => {
    const repeat = createPadRepeater();
    expect(repeat("next", 0)).toBe("next");
    expect(repeat("next", 399)).toBeNull();
    expect(repeat("next", 400)).toBe("next");
    expect(repeat("next", 401)).toBeNull();
    expect(repeat("confirm", 500)).toBe("confirm");
    expect(repeat("confirm", 5000)).toBeNull();
    repeat(null, 5001);
    expect(repeat("confirm", 5002)).toBe("confirm");
  });
});
