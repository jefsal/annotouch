import type { AnnotationStore } from "./annotationStore";
import { READY_STATUS_MESSAGE } from "./app/state";
import { getCanvasPoint } from "./domain/canvasCoordinates";
import { distance } from "./domain/geometry";
import type { PenSettings, Point, TextAnnotation } from "./domain/types";
import { openTextEditor, type TextEditorSession } from "./textEditor";

const MIN_POINT_DISTANCE = 0.75;
const ERASER_TOLERANCE = 8;

export interface AnnotatorPage {
  pageNumber: number;
  pageShell: HTMLElement;
  annotationCanvas: HTMLCanvasElement;
}

export interface AnnotatorOptions {
  getPenSettings: () => PenSettings;
  annotationStore: AnnotationStore;
  onStatusChange?: (message: string) => void;
  onTextDraftChange?: (hasDraft: boolean) => void;
  onTextModeChange?: (isActive: boolean) => void;
}

export interface Annotator {
  registerPage(page: AnnotatorPage): void;
  unregisterPage(pageNumber: number): void;
  setPages(pages: AnnotatorPage[]): void;
  /** Arms or disarms text placement; returns whether it is now armed. */
  toggleTextMode(): boolean;
  /** Disarms text placement; returns whether anything was disarmed. */
  cancelTextMode(): boolean;
  destroy(): void;
}

interface ActiveStroke {
  pageNumber: number;
  color: string;
  width: number;
  points: Point[];
}

interface PagePointer {
  pageNumber: number;
  point: Point;
}

/** The parts of a pointer or mouse event needed to locate a page position. */
interface PointerLike {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
}

/**
 * The interaction modes are mutually exclusive: holding the eraser ends a
 * stroke, drawing or erasing disarms text placement, and an open editor
 * swallows every other interaction.
 */
type InteractionMode =
  | { type: "idle" }
  | { type: "drawing"; stroke: ActiveStroke | null }
  | { type: "erasing" }
  | { type: "placingText" }
  | { type: "editingText"; session: TextEditorSession };

export function createAnnotator({
  getPenSettings,
  annotationStore,
  onStatusChange,
  onTextDraftChange,
  onTextModeChange,
}: AnnotatorOptions): Annotator {
  const pages = new Map<number, AnnotatorPage>();
  /** The same pages keyed by shell, so a pointer target resolves without a scan. */
  const pagesByShell = new Map<Element, AnnotatorPage>();

  let mode: InteractionMode = { type: "idle" };
  let lastPointer: PagePointer | null = null;

  function addPage(page: AnnotatorPage): void {
    removePage(page.pageNumber);
    pages.set(page.pageNumber, page);
    pagesByShell.set(page.pageShell, page);
  }

  function removePage(pageNumber: number): void {
    const page = pages.get(pageNumber);
    if (!page) return;

    pages.delete(pageNumber);
    pagesByShell.delete(page.pageShell);
  }

  function clearPages(): void {
    pages.clear();
    pagesByShell.clear();
  }

  function setStatus(message: string): void {
    onStatusChange?.(message);
  }

  function setTextModeActive(
    isActive: boolean,
    { updateStatus = true } = {}
  ): void {
    if (isActive) {
      mode = { type: "placingText" };
    } else if (mode.type === "placingText") {
      mode = { type: "idle" };
    }

    onTextModeChange?.(isActive);

    if (updateStatus && mode.type !== "editingText") {
      setStatus(isActive ? "click a page to add text" : READY_STATUS_MESSAGE);
    }
  }

  function toggleTextMode(): boolean {
    if (pages.size === 0 || mode.type === "editingText") {
      return false;
    }

    const nextActive = mode.type !== "placingText";
    setTextModeActive(nextActive);
    return nextActive;
  }

  function cancelTextMode(): boolean {
    if (mode.type !== "placingText") {
      return false;
    }

    setTextModeActive(false);
    return true;
  }

  function handlePointerDown(event: PointerEvent): void {
    if (
      mode.type !== "placingText" ||
      event.button !== 0 ||
      isInteractiveTarget(event.target)
    ) {
      return;
    }

    const pointer = getPagePointer(event);
    if (!pointer) return;

    event.preventDefault();
    startTextEditor(pointer);
  }

  function handleDoubleClick(event: MouseEvent): void {
    if (
      mode.type === "placingText" ||
      mode.type === "editingText" ||
      event.button !== 0 ||
      isInteractiveTarget(event.target)
    ) {
      return;
    }

    const pointer = getPagePointer(event);
    if (!pointer) return;

    const annotation = annotationStore.getTextAt(
      pointer.pageNumber,
      pointer.point
    );
    if (!annotation) return;

    event.preventDefault();
    startTextEditor(pointer, annotation);
  }

  function handlePointerMove(event: PointerEvent): void {
    const pointer = getPagePointer(event);

    if (!pointer) {
      lastPointer = null;

      if (mode.type === "drawing") {
        finishStroke();
      }
      return;
    }

    lastPointer = pointer;

    if (mode.type === "erasing") {
      eraseAtPointer(pointer);
      return;
    }

    if (mode.type !== "drawing") {
      return;
    }

    if (!mode.stroke) {
      startStroke(pointer);
      return;
    }

    if (mode.stroke.pageNumber !== pointer.pageNumber) {
      finishStroke();
      startStroke(pointer);
      return;
    }

    addPoint(mode.stroke, pointer.point);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (isInteractiveTarget(event.target)) {
      return;
    }

    if (event.code === "Space") {
      disarmTextPlacement();
      handleDrawKeyDown(event);
      return;
    }

    if (event.code === "KeyE") {
      disarmTextPlacement();
      handleEraserKeyDown(event);
    }
  }

  function disarmTextPlacement(): void {
    if (mode.type === "placingText") {
      setTextModeActive(false, { updateStatus: false });
    }
  }

  function handleDrawKeyDown(event: KeyboardEvent): void {
    event.preventDefault();

    if (event.repeat || mode.type === "erasing") {
      return;
    }

    const stroke = mode.type === "drawing" ? mode.stroke : null;

    mode = { type: "drawing", stroke };
    setStatus("drawing");

    if (lastPointer && !stroke) {
      startStroke(lastPointer);
    }
  }

  function handleEraserKeyDown(event: KeyboardEvent): void {
    event.preventDefault();

    if (event.repeat || mode.type === "erasing") {
      return;
    }

    const hadStroke = mode.type === "drawing" && Boolean(mode.stroke);
    finishStroke();

    mode = { type: "erasing" };
    setStatus("erasing");

    if (lastPointer && !hadStroke) {
      eraseAtPointer(lastPointer);
    }
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.code === "Space") {
      handleDrawKeyUp(event);
      return;
    }

    if (event.code === "KeyE") {
      handleEraserKeyUp(event);
    }
  }

  function handleDrawKeyUp(event: KeyboardEvent): void {
    event.preventDefault();
    finishStroke();

    if (mode.type === "erasing") {
      return;
    }

    if (mode.type === "drawing") {
      mode = { type: "idle" };
    }

    setStatus(READY_STATUS_MESSAGE);
  }

  function handleEraserKeyUp(event: KeyboardEvent): void {
    if (mode.type !== "erasing") {
      return;
    }

    event.preventDefault();
    mode = { type: "idle" };
    setStatus(READY_STATUS_MESSAGE);
  }

  function startStroke(pointer: PagePointer): void {
    if (mode.type !== "drawing") {
      return;
    }

    const penSettings = getPenSettings();
    const stroke: ActiveStroke = {
      pageNumber: pointer.pageNumber,
      color: penSettings.color,
      width: penSettings.width,
      points: [pointer.point],
    };

    mode = { type: "drawing", stroke };
    annotationStore.redrawPage(stroke.pageNumber, stroke);
  }

  function addPoint(stroke: ActiveStroke, point: Point): void {
    const previous = stroke.points[stroke.points.length - 1];

    if (previous && distance(previous, point) < MIN_POINT_DISTANCE) {
      return;
    }

    stroke.points.push(point);
    annotationStore.redrawPage(stroke.pageNumber, stroke);
  }

  function finishStroke(): void {
    if (mode.type !== "drawing" || !mode.stroke) {
      return;
    }

    const { stroke } = mode;
    mode = { type: "drawing", stroke: null };

    if (stroke.points.length > 1) {
      annotationStore.addStroke(stroke.pageNumber, stroke);
    } else {
      annotationStore.redrawPage(stroke.pageNumber);
    }
  }

  function eraseAtPointer(pointer: PagePointer): void {
    annotationStore.eraseAnnotationAt(
      pointer.pageNumber,
      pointer.point,
      ERASER_TOLERANCE
    );
  }

  function startTextEditor(
    pointer: PagePointer,
    annotation: TextAnnotation | null = null
  ): void {
    const page = pages.get(pointer.pageNumber);
    if (!page) {
      return;
    }

    const session = openTextEditor({
      page,
      point: pointer.point,
      annotation,
      penSettings: getPenSettings(),
      annotationStore,
      onDraftChange: (hasDraft) => onTextDraftChange?.(hasDraft),
      onStatusChange: setStatus,
      onClose: () => {
        if (mode.type === "editingText") {
          mode = { type: "idle" };
        }

        setTextModeActive(false);
      },
    });

    mode = { type: "editingText", session };
  }

  function closeEditor({ commit }: { commit: boolean }): void {
    if (mode.type === "editingText") {
      mode.session.close({ commit });
    }
  }

  /** Abandons any in-flight stroke or erase, e.g. on blur or tab switch. */
  function cancelInteraction(): void {
    if (mode.type === "drawing" || mode.type === "erasing") {
      mode = { type: "idle" };
    }

    annotationStore.redrawAll();

    if (mode.type === "idle") {
      setStatus(READY_STATUS_MESSAGE);
    }
  }

  /**
   * Resolves the pointer against the page under it. The page is found by
   * walking up from the event target rather than by scanning every registered
   * page: rendering is monotonic, so a reader who scrolls a long document
   * accumulates hundreds of live pages, and testing each one cost a forced
   * layout on every pointer move.
   */
  function getPagePointer(event: PointerLike): PagePointer | null {
    const page = getPageFromTarget(event.target);
    if (!page) return null;

    const point = getCanvasPoint(page.annotationCanvas, event);
    return point ? { pageNumber: page.pageNumber, point } : null;
  }

  function getPageFromTarget(target: EventTarget | null): AnnotatorPage | null {
    if (!(target instanceof Element)) return null;

    for (
      let element: Element | null = target;
      element;
      element = element.parentElement
    ) {
      const page = pagesByShell.get(element);
      if (page) return page;
    }

    return null;
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === "hidden") {
      cancelInteraction();
    }
  }

  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("dblclick", handleDoubleClick);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", cancelInteraction);

  return {
    registerPage(page) {
      addPage(page);
    },

    unregisterPage(pageNumber) {
      if (mode.type === "drawing" && mode.stroke?.pageNumber === pageNumber) {
        cancelInteraction();
      }

      if (
        mode.type === "editingText" &&
        mode.session.pageNumber === pageNumber
      ) {
        closeEditor({ commit: false });
      }

      removePage(pageNumber);
    },

    setPages(nextPages) {
      closeEditor({ commit: false });
      clearPages();

      for (const page of nextPages) {
        addPage(page);
      }

      cancelInteraction();
      setTextModeActive(false, { updateStatus: false });
    },

    toggleTextMode,
    cancelTextMode,

    destroy() {
      closeEditor({ commit: false });
      clearPages();
      mode = { type: "idle" };
      lastPointer = null;

      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("dblclick", handleDoubleClick);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", cancelInteraction);
    },
  };
}

/**
 * Wider than `isEditableTarget` in `app/shortcuts`, which this deliberately
 * does not reuse: buttons count here too, so holding Space on a focused control
 * activates it instead of starting a stroke.
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, button, [contenteditable='true']")
  );
}
