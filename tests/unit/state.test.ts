import { describe, expect, it } from "vitest";

import {
  MAX_VIEW_SCALE,
  MIN_VIEW_SCALE,
  PEN_WIDTHS,
} from "../../src/app/config";
import {
  appReducer,
  canExport,
  canRedo,
  canUndo,
  canZoomIn,
  canZoomOut,
  createInitialState,
  hasUnsavedWork,
  IDLE_STATUS_MESSAGE,
  type AppAction,
  type AppState,
} from "../../src/app/state";

function reduce(state: AppState, ...actions: AppAction[]): AppState {
  return actions.reduce(appReducer, state);
}

function loadedState(
  overrides: { totalPageCount?: number; annotatablePageCount?: number } = {}
): AppState {
  return reduce(
    createInitialState(),
    { type: "document/loading", fileName: "notes.pdf" },
    {
      type: "document/loaded",
      fileName: "notes.pdf",
      totalPageCount: overrides.totalPageCount ?? 3,
      annotatablePageCount: overrides.annotatablePageCount ?? 3,
    },
    { type: "busy/set", isBusy: false }
  );
}

describe("createInitialState", () => {
  it("starts idle with the muted empty status", () => {
    const state = createInitialState();

    expect(state.document).toEqual({ status: "idle" });
    expect(state.status).toEqual({
      message: IDLE_STATUS_MESSAGE,
      isMuted: true,
    });
    expect(state.isBusy).toBe(false);
    expect(canExport(state)).toBe(false);
  });

  it("adopts persisted theme and toolbar preferences", () => {
    const state = createInitialState({
      theme: "night",
      toolbar: { showHistoryControls: true },
    });

    expect(state.theme).toBe("night");
    expect(state.toolbar.showHistoryControls).toBe(true);
  });
});

describe("document lifecycle", () => {
  it("reports how many pages are ready", () => {
    expect(loadedState().status.message).toBe("3 pages ready");
    expect(
      loadedState({ annotatablePageCount: 1, totalPageCount: 1 }).status.message
    ).toBe("1 page ready");
  });

  it("reports the annotation cap when the document is longer", () => {
    const state = loadedState({
      totalPageCount: 320,
      annotatablePageCount: 200,
    });

    expect(state.status.message).toBe("showing first 200 of 320 pages");
  });

  it("discards previous document state when a replacement starts loading", () => {
    const state = reduce(
      loadedState(),
      { type: "view/zoomIn" },
      { type: "text/setMode", isActive: true },
      { type: "text/setDraft", hasDraft: true },
      {
        type: "history/sync",
        history: { canUndo: true, canRedo: true, annotationCount: 4 },
      },
      { type: "document/loading", fileName: "other.pdf" }
    );

    expect(state.document).toEqual({
      status: "loading",
      fileName: "other.pdf",
    });
    expect(state.viewScale).toBe(1);
    expect(state.isTextMode).toBe(false);
    expect(state.history.annotationCount).toBe(0);
    expect(hasUnsavedWork(state)).toBe(false);
    expect(state.isBusy).toBe(true);
  });

  it("keeps preferences and pen settings across document replacement", () => {
    const state = reduce(
      createInitialState({
        theme: "night",
        toolbar: { showHistoryControls: true },
      }),
      { type: "pen/setColor", color: "#16a34a" },
      { type: "document/loading", fileName: "notes.pdf" },
      { type: "document/closed" }
    );

    expect(state.theme).toBe("night");
    expect(state.toolbar.showHistoryControls).toBe(true);
    expect(state.pen.color).toBe("#16a34a");
    expect(state.status).toEqual({
      message: IDLE_STATUS_MESSAGE,
      isMuted: true,
    });
  });

  it("surfaces the failure message and returns to the idle document", () => {
    const state = reduce(loadedState(), {
      type: "document/failed",
      message: "could not load PDF",
    });

    expect(state.document).toEqual({
      status: "error",
      message: "could not load PDF",
    });
    expect(state.status.message).toBe("could not load PDF");
    expect(canExport(state)).toBe(false);
  });
});

describe("zoom", () => {
  it("steps and rounds the view scale", () => {
    const state = reduce(
      loadedState(),
      { type: "view/zoomIn" },
      { type: "view/zoomIn" },
      { type: "view/zoomOut" }
    );

    expect(state.viewScale).toBe(1.1);
  });

  it("clamps to the supported range", () => {
    const zoomedIn = reduce(loadedState(), {
      type: "view/setScale",
      scale: 12,
    });
    const zoomedOut = reduce(loadedState(), {
      type: "view/setScale",
      scale: -3,
    });

    expect(zoomedIn.viewScale).toBe(MAX_VIEW_SCALE);
    expect(canZoomIn(zoomedIn)).toBe(false);
    expect(zoomedOut.viewScale).toBe(MIN_VIEW_SCALE);
    expect(canZoomOut(zoomedOut)).toBe(false);
  });

  it("returns the same state when the scale does not move", () => {
    const state = loadedState();

    expect(appReducer(state, { type: "view/setScale", scale: 1 })).toBe(state);
  });

  it("cannot zoom without a document", () => {
    const state = createInitialState();

    expect(canZoomIn(state)).toBe(false);
    expect(canZoomOut(state)).toBe(false);
  });
});

describe("pen settings", () => {
  it("cycles stroke width through the configured presets", () => {
    let state = createInitialState();

    for (const width of [...PEN_WIDTHS.slice(1), PEN_WIDTHS[0]]) {
      state = appReducer(state, { type: "pen/cycleWidth" });
      expect(state.pen.width).toBe(width.value);
    }
  });
});

describe("panels", () => {
  it("closes the settings popover when the shortcut dialog opens", () => {
    const state = reduce(
      createInitialState(),
      { type: "settings/toggle" },
      { type: "shortcuts/setOpen", isOpen: true }
    );

    expect(state.isSettingsOpen).toBe(false);
    expect(state.isShortcutDialogOpen).toBe(true);
  });
});

describe("busy state", () => {
  it("suspends history, zoom, and export while work is in flight", () => {
    const state = reduce(
      loadedState(),
      {
        type: "history/sync",
        history: { canUndo: true, canRedo: true, annotationCount: 2 },
      },
      { type: "busy/set", isBusy: true }
    );

    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
    expect(canZoomIn(state)).toBe(false);
    expect(canExport(state)).toBe(false);
    expect(hasUnsavedWork(state)).toBe(true);
  });
});
