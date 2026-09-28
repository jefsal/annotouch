import { afterEach, describe, expect, it, vi } from "vitest";

import { createAnnotationStore } from "../../src/annotationStore";
import {
  createAnnotator,
  HIGHLIGHT_MODE_STATUS_MESSAGE,
  NO_PAGE_TEXT_STATUS_MESSAGE,
  PAGE_TEXT_PENDING_STATUS_MESSAGE,
  type PageTextLookup,
  type Annotator,
} from "../../src/annotator";
import { layoutPageText } from "../../src/domain/textSelection";

const PEN_SETTINGS = { color: "#e11d48", width: 5 };

let activeAnnotator: Annotator | null = null;
let activeCanvas: HTMLCanvasElement | null = null;

function createPage(pageNumber: number, { zoom = 1 } = {}) {
  const pageShell = document.createElement("div");
  const annotationCanvas = document.createElement("canvas");

  annotationCanvas.width = 600;
  annotationCanvas.height = 800;
  // jsdom has no 2D context; the store treats a missing one as "nothing to
  // repaint", which is all these interaction tests need.
  annotationCanvas.getContext = (() => null) as HTMLCanvasElement["getContext"];
  annotationCanvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 600 * zoom,
      height: 800 * zoom,
    }) as DOMRect;

  pageShell.append(annotationCanvas);
  document.body.append(pageShell);

  return { pageNumber, pageShell, annotationCanvas };
}

/** "hello world" on one line, ten canvas pixels per glyph from x = 100. */
const PAGE_TEXT = layoutPageText([
  {
    text: "hello world",
    x: 100,
    y: 100,
    dirX: 1,
    dirY: 0,
    length: 110,
    ascent: 8,
    descent: 2,
    fontFamily: "sans-serif",
    hasEOL: false,
  },
]);

function setup({
  zoom = 1,
  pageText = PAGE_TEXT,
  getPageText = () => pageText,
}: {
  zoom?: number;
  pageText?: PageTextLookup;
  getPageText?: () => PageTextLookup;
} = {}) {
  const statuses: string[] = [];
  const onTextModeChange = vi.fn();
  const onHighlightModeChange = vi.fn();
  const onTextDraftChange = vi.fn();
  const store = createAnnotationStore();
  const page = createPage(1, { zoom });
  const annotator = createAnnotator({
    getPenSettings: () => ({ ...PEN_SETTINGS }),
    annotationStore: store,
    onStatusChange: (message) => statuses.push(message),
    onTextDraftChange,
    onTextModeChange,
    onHighlightModeChange,
    getPageText,
  });

  activeAnnotator = annotator;
  activeCanvas = page.annotationCanvas;
  annotator.registerPage(page);
  store.registerPage({ pageNumber: 1, canvas: page.annotationCanvas });

  return {
    annotator,
    store,
    statuses,
    page,
    onTextModeChange,
    onHighlightModeChange,
  };
}

/**
 * Dispatched from the annotation canvas, as a browser would: the annotator
 * locates the page from the event target, and only falls back to the pointer
 * position for the in-canvas bounds check.
 */
function movePointer(clientX: number, clientY: number): void {
  const target: EventTarget = activeCanvas ?? document;

  target.dispatchEvent(
    new MouseEvent("pointermove", { clientX, clientY, bubbles: true })
  );
}

/** jsdom has no PointerEvent, so a MouseEvent carries the pointer ID. */
function pointer(
  type: string,
  clientX: number,
  clientY: number,
  pointerId = 1,
  target: EventTarget = activeCanvas ?? document
): void {
  const event = new MouseEvent(type, {
    clientX,
    clientY,
    button: 0,
    bubbles: true,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  target.dispatchEvent(event);
}

function dragHighlight(fromX: number, toX: number, y = 96): void {
  pointer("pointerdown", fromX, y);
  pointer("pointermove", (fromX + toX) / 2, y);
  pointer("pointermove", toX, y);
  pointer("pointerup", toX, y);
}

function pressKey(code: string, { repeat = false } = {}): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { code, repeat, bubbles: true })
  );
}

function releaseKey(code: string): void {
  document.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
}

function drawStroke(): void {
  pressKey("Space");
  movePointer(100, 100);
  movePointer(160, 140);
  movePointer(220, 180);
  releaseKey("Space");
}

afterEach(() => {
  activeAnnotator?.destroy();
  activeAnnotator = null;
  activeCanvas = null;
  document.body.replaceChildren();
});

describe("annotator interaction modes", () => {
  it("commits a stroke drawn while the draw key is held", () => {
    const { store, statuses } = setup();

    drawStroke();

    const annotations = store.getAnnotationsByPage().get(1) ?? [];
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({
      type: "stroke",
      color: PEN_SETTINGS.color,
      width: PEN_SETTINGS.width,
    });
    expect(statuses).toEqual(["drawing", "ready"]);
  });

  it("stores canvas-space coordinates regardless of zoom", () => {
    const { store } = setup({ zoom: 0.5 });

    pressKey("Space");
    movePointer(50, 50);
    movePointer(110, 90);
    releaseKey("Space");

    const [annotation] = store.getAnnotationsByPage().get(1) ?? [];

    expect(annotation?.type).toBe("stroke");
    if (annotation?.type === "stroke") {
      expect(annotation.points[0]).toEqual({ x: 100, y: 100 });
      expect(annotation.points.at(-1)).toEqual({ x: 220, y: 180 });
    }
  });

  it("discards an in-flight stroke when the window loses focus", () => {
    const { store, statuses } = setup();

    pressKey("Space");
    movePointer(100, 100);
    movePointer(160, 140);
    window.dispatchEvent(new Event("blur"));

    expect(store.getAnnotationCount()).toBe(0);
    expect(statuses.at(-1)).toBe("ready");

    // The abandoned stroke must not resume on the next pointer move.
    movePointer(200, 160);
    releaseKey("Space");
    expect(store.getAnnotationCount()).toBe(0);
  });

  it("discards an in-flight stroke when the page is hidden", () => {
    const { store } = setup();

    pressKey("Space");
    movePointer(100, 100);
    movePointer(160, 140);

    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    visibility.mockRestore();

    expect(store.getAnnotationCount()).toBe(0);
  });

  it("commits the current stroke before switching to the eraser", () => {
    const { store, statuses } = setup();

    pressKey("Space");
    movePointer(100, 100);
    movePointer(160, 140);
    pressKey("KeyE");

    expect(store.getAnnotationCount()).toBe(1);
    expect(statuses).toEqual(["drawing", "erasing"]);

    releaseKey("KeyE");
    expect(statuses.at(-1)).toBe("ready");
  });

  it("erases whole annotations under the pointer while the eraser is held", () => {
    const { store } = setup();

    drawStroke();
    expect(store.getAnnotationCount()).toBe(1);

    movePointer(160, 140);
    pressKey("KeyE");

    expect(store.getAnnotationCount()).toBe(0);

    store.undo();
    expect(store.getAnnotationCount()).toBe(1);
  });

  it("ignores repeated key events while a mode is already active", () => {
    const { statuses } = setup();

    pressKey("Space");
    pressKey("Space", { repeat: true });
    releaseKey("Space");

    expect(statuses).toEqual(["drawing", "ready"]);
  });

  it("arms and disarms text placement", () => {
    const { annotator, statuses, onTextModeChange } = setup();

    expect(annotator.toggleTextMode()).toBe(true);
    expect(statuses.at(-1)).toBe("click a page to add text");
    expect(onTextModeChange).toHaveBeenLastCalledWith(true);

    expect(annotator.cancelTextMode()).toBe(true);
    expect(statuses.at(-1)).toBe("ready");
    expect(onTextModeChange).toHaveBeenLastCalledWith(false);

    // Escape is a no-op once text placement is already disarmed.
    expect(annotator.cancelTextMode()).toBe(false);
  });

  it("disarms text placement as soon as drawing starts", () => {
    const { annotator, onTextModeChange } = setup();

    annotator.toggleTextMode();
    pressKey("Space");

    expect(onTextModeChange).toHaveBeenLastCalledWith(false);
    expect(annotator.cancelTextMode()).toBe(false);
  });

  it("refuses text placement without registered pages", () => {
    const { annotator } = setup();

    annotator.setPages([]);
    expect(annotator.toggleTextMode()).toBe(false);
  });

  it("stops responding to input after teardown", () => {
    const { annotator, store, statuses } = setup();

    annotator.destroy();
    activeAnnotator = null;
    statuses.length = 0;

    drawStroke();

    expect(store.getAnnotationCount()).toBe(0);
    expect(statuses).toEqual([]);
  });

  it("highlights the text dragged across while highlight mode is armed", () => {
    const { annotator, store, statuses, onHighlightModeChange } = setup();

    // Unarmed, a drag does nothing.
    dragHighlight(100, 150);
    expect(store.getAnnotationCount()).toBe(0);

    expect(annotator.toggleHighlightMode()).toBe(true);
    expect(onHighlightModeChange).toHaveBeenLastCalledWith(true);
    expect(statuses.at(-1)).toBe(HIGHLIGHT_MODE_STATUS_MESSAGE);

    dragHighlight(101, 149);

    const [highlight] = store.getAnnotationsByPage().get(1) ?? [];
    expect(highlight).toMatchObject({
      type: "highlight",
      color: "#facc15",
      text: "hello",
      rects: [{ x: 100, y: 92, width: 50, height: 10 }],
    });

    // Stays armed for the next passage, and undo/redo walk the history.
    dragHighlight(161, 209);
    expect(store.getAnnotationCount()).toBe(2);
    store.undo();
    expect(store.getAnnotationCount()).toBe(1);
    store.redo();
    expect(store.getAnnotationsByPage().get(1)?.[1]).toMatchObject({
      text: "world",
    });

    expect(annotator.toggleHighlightMode()).toBe(false);
    expect(onHighlightModeChange).toHaveBeenLastCalledWith(false);
    dragHighlight(100, 150);
    expect(store.getAnnotationCount()).toBe(2);
  });

  it("keeps extending the selection after the pointer leaves the page", () => {
    const { annotator, store } = setup();

    annotator.toggleHighlightMode();
    pointer("pointerdown", 101, 96);
    pointer("pointermove", 900, 96, 1, document);
    pointer("pointerup", 900, 96, 1, document);

    expect(store.getAnnotationsByPage().get(1)?.[0]).toMatchObject({
      text: "hello world",
    });
  });

  it("ignores a click that selects nothing", () => {
    const { annotator, store } = setup();

    annotator.toggleHighlightMode();
    dragHighlight(101, 101);
    // Far from any text, a drag never starts.
    dragHighlight(400, 500, 600);

    expect(store.getAnnotationCount()).toBe(0);
  });

  it("reports a page without selectable text", () => {
    const { annotator, store, statuses } = setup({ pageText: null });

    annotator.toggleHighlightMode();
    dragHighlight(101, 149);

    expect(store.getAnnotationCount()).toBe(0);
    expect(statuses.at(-1)).toBe(NO_PAGE_TEXT_STATUS_MESSAGE);
  });

  it("keeps highlighting and text placement mutually exclusive", () => {
    const { annotator, onTextModeChange, onHighlightModeChange } = setup();

    annotator.toggleHighlightMode();
    annotator.toggleTextMode();
    expect(onHighlightModeChange).toHaveBeenLastCalledWith(false);
    expect(annotator.cancelHighlightMode()).toBe(false);

    annotator.toggleHighlightMode();
    expect(onTextModeChange).toHaveBeenLastCalledWith(false);
    expect(annotator.cancelTextMode()).toBe(false);

    pressKey("KeyE");
    releaseKey("KeyE");
    expect(onHighlightModeChange).toHaveBeenLastCalledWith(false);
    expect(annotator.cancelHighlightMode()).toBe(false);
  });

  it("discards an in-flight selection when the window loses focus", () => {
    const { annotator, store } = setup();

    annotator.toggleHighlightMode();
    pointer("pointerdown", 101, 96);
    pointer("pointermove", 149, 96);
    window.dispatchEvent(new Event("blur"));
    pointer("pointerup", 149, 96);

    expect(store.getAnnotationCount()).toBe(0);
    expect(annotator.cancelHighlightMode()).toBe(true);
  });

  it("completes a drag that starts before the page text has loaded", () => {
    let pageText: PageTextLookup = "pending";
    const { annotator, store, statuses } = setup({
      getPageText: () => pageText,
    });

    annotator.toggleHighlightMode();
    pointer("pointerdown", 101, 96);
    pointer("pointermove", 120, 96);
    expect(statuses.at(-1)).toBe(HIGHLIGHT_MODE_STATUS_MESSAGE);

    pageText = PAGE_TEXT;
    pointer("pointermove", 149, 96);
    pointer("pointerup", 149, 96);

    expect(store.getAnnotationsByPage().get(1)?.[0]).toMatchObject({
      text: "hello",
    });
  });

  it("asks for a retry when the page text is still loading on release", () => {
    const { annotator, store, statuses } = setup({ pageText: "pending" });

    annotator.toggleHighlightMode();
    dragHighlight(101, 149);

    expect(store.getAnnotationCount()).toBe(0);
    expect(statuses.at(-1)).toBe(PAGE_TEXT_PENDING_STATUS_MESSAGE);
  });

  it("lets only the pointer that started a selection move or end it", () => {
    const { annotator, store } = setup();

    annotator.toggleHighlightMode();
    pointer("pointerdown", 101, 96, 1);
    pointer("pointermove", 149, 96, 1);

    // A second touch neither starts its own selection nor steers this one.
    pointer("pointerdown", 161, 96, 2);
    pointer("pointermove", 209, 96, 2);
    pointer("pointerup", 209, 96, 2);
    pointer("pointercancel", 209, 96, 2);
    expect(store.getAnnotationCount()).toBe(0);

    pointer("pointerup", 149, 96, 1);
    expect(store.getAnnotationsByPage().get(1)).toEqual([
      expect.objectContaining({ text: "hello" }),
    ]);
  });
});
