import { afterEach, describe, expect, it, vi } from "vitest";

import { createAnnotationStore } from "../../src/annotationStore";
import { createAnnotator, type Annotator } from "../../src/annotator";

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

function setup({ zoom = 1 } = {}) {
  const statuses: string[] = [];
  const onTextModeChange = vi.fn();
  const onTextDraftChange = vi.fn();
  const store = createAnnotationStore();
  const page = createPage(1, { zoom });
  const annotator = createAnnotator({
    getPenSettings: () => ({ ...PEN_SETTINGS }),
    annotationStore: store,
    onStatusChange: (message) => statuses.push(message),
    onTextDraftChange,
    onTextModeChange,
  });

  activeAnnotator = annotator;
  activeCanvas = page.annotationCanvas;
  annotator.registerPage(page);
  store.registerPage({ pageNumber: 1, canvas: page.annotationCanvas });

  return { annotator, store, statuses, page, onTextModeChange };
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
});
