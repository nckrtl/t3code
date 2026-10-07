import { act, type KeyboardEvent, type PointerEvent, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useToolbarPanelResize } from "./panelResize";

const storageKey = "t3code:laravel-toolbar-panel-height";
const values = new Map<string, string>();
const frames = new Map<number, FrameRequestCallback>();
let renderer: ReactTestRenderer | undefined;
let resize: ReturnType<typeof useToolbarPanelResize>;
let measure: () => void;
let top = 700;
let frameId = 0;
const pin = vi.fn();
const setItem = vi.fn((key: string, value: string) => values.set(key, value));

class Target {
  setPointerCapture = vi.fn();
  hasPointerCapture = () => true;
  releasePointerCapture = vi.fn();
  closest: () => Target | null = () => null;
}
const target = new Target();
const hostRef = {
  current: {
    parentElement: { getBoundingClientRect: () => ({ top: 0 }) },
    previousElementSibling: { getBoundingClientRect: () => ({ top: 40 }) },
    getBoundingClientRect: () => ({ top }),
  } as unknown as HTMLDivElement,
};

function Probe() {
  const value = useToolbarPanelResize(hostRef, pin);
  useLayoutEffect(() => {
    resize = value;
  });
  return null;
}

function pointer(clientY: number, overrides = {}) {
  return {
    button: 0,
    pointerId: 1,
    clientX: 100,
    clientY,
    currentTarget: target,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  } as unknown as PointerEvent<HTMLDivElement>;
}

beforeEach(() => {
  values.clear();
  frames.clear();
  top = 700;
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Element", Target);
  const events = new EventTarget();
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  vi.stubGlobal("document", { body: { style: { removeProperty: vi.fn() } } });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    renderer = create(<Probe />);
  });
}

describe("toolbar panel resizing", () => {
  it("grows upward and persists the final position even before a queued frame runs", async () => {
    await mount();
    await act(async () => resize.handlers.onPointerDown(pointer(400)));
    await act(async () => resize.handlers.onPointerMove(pointer(320, { clientX: 900 })));
    expect(setItem).not.toHaveBeenCalled();
    await act(async () => resize.handlers.onPointerUp(pointer(280)));
    expect(resize.height).toBe(504);
    expect(values.get(storageKey)).toBe("504");
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    await act(async () => renderer?.unmount());
    await mount();
    expect(resize.height).toBe(504);
  });

  it("fits small page areas without overwriting the saved height", async () => {
    values.set(storageKey, "500");
    await mount();
    expect(resize.maxHeight).toBe(644);
    top = 180;
    await act(async () => measure());
    expect(resize.height).toBe(124);
    expect(resize.minHeight).toBe(124);
    expect(values.get(storageKey)).toBe("500");
    top = 700;
    await act(async () => measure());
    expect(resize.height).toBe(500);
  });

  it("clamps keyboard resizing and saves it across remounts", async () => {
    await mount();
    const key = (key: string) =>
      ({
        key,
        shiftKey: false,
        preventDefault: vi.fn(),
      }) as unknown as KeyboardEvent<HTMLDivElement>;
    await act(async () => resize.onKeyDown(key("End")));
    expect(resize.height).toBe(644);
    await act(async () => resize.onKeyDown(key("ArrowUp")));
    expect(resize.height).toBe(644);
    await act(async () => resize.onKeyDown(key("Home")));
    expect(resize.height).toBe(192);
    await act(async () => renderer?.unmount());
    await mount();
    expect(resize.height).toBe(192);
  });

  it("ignores header controls and invalid persisted values", async () => {
    values.set(storageKey, '"bad height"');
    await mount();
    expect(resize.height).toBe(384);
    const button = new Target();
    button.closest = () => button;
    await act(async () => resize.handlers.onPointerDown(pointer(400, { target: button })));
    expect(pin).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
