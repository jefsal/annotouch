import { drawAnnotation, drawStroke } from "./domain/annotationRenderer";
import { isPointInAnnotation, isPointInText } from "./domain/geometry";
import type {
  Annotation,
  AnnotationHistoryAction,
  AnnotationId,
  Point,
  StrokeAnnotation,
  StrokeDraft,
  TextAnnotation,
  TextAnnotationDraft,
} from "./domain/types";

interface PageState {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  annotations: Annotation[];
}

interface AnnotationStoreOptions {
  onChange?: () => void;
}

interface RegisterPageInput {
  pageNumber: number;
  canvas: HTMLCanvasElement;
}

type TextAnnotationUpdates = Partial<
  Pick<
    TextAnnotation,
    | "text"
    | "x"
    | "y"
    | "width"
    | "height"
    | "color"
    | "fontSize"
    | "lineHeight"
  >
>;

export interface AnnotationStore {
  registerPage(input: RegisterPageInput): void;
  reset(): void;
  addStroke(pageNumber: number, stroke: StrokeDraft): StrokeAnnotation;
  addText(pageNumber: number, annotation: TextAnnotationDraft): TextAnnotation;
  updateText(
    pageNumber: number,
    annotationId: AnnotationId,
    updates: TextAnnotationUpdates
  ): TextAnnotation | null;
  eraseAnnotationAt(
    pageNumber: number,
    point: Point,
    tolerance?: number
  ): boolean;
  getTextAt(
    pageNumber: number,
    point: Point,
    tolerance?: number
  ): TextAnnotation | null;
  removeAnnotation(pageNumber: number, annotationId: AnnotationId): boolean;
  undo(): void;
  redo(): void;
  redrawPage(
    pageNumber: number,
    draftStroke?: StrokeDraft | null,
    excludedAnnotationId?: AnnotationId | null
  ): void;
  redrawAll(): void;
  getAnnotationsByPage(): Map<number, Annotation[]>;
  canUndo(): boolean;
  canRedo(): boolean;
  getAnnotationCount(): number;
}

export function createAnnotationStore({
  onChange,
}: AnnotationStoreOptions = {}): AnnotationStore {
  const pages = new Map<number, PageState>();
  const undoStack: AnnotationHistoryAction[] = [];
  const redoStack: AnnotationHistoryAction[] = [];
  let nextAnnotationId = 1;

  const notifyChange = (): void => {
    onChange?.();
  };

  const clearHistory = (): void => {
    undoStack.length = 0;
    redoStack.length = 0;
  };

  const nextId = (): AnnotationId => `annotation-${nextAnnotationId++}`;

  /** Appends an annotation, records it as undoable, and repaints the page. */
  function appendAnnotation<TAnnotation extends Annotation>(
    pageNumber: number,
    annotation: TAnnotation
  ): TAnnotation {
    const pageState = getOrCreatePageState(pages, pageNumber);
    const index = pageState.annotations.length;

    pageState.annotations.push(annotation);
    undoStack.push({ type: "add", pageNumber, annotation, index });
    redoStack.length = 0;
    store.redrawPage(pageNumber);
    notifyChange();

    return annotation;
  }

  const store: AnnotationStore = {
    registerPage({ pageNumber, canvas }) {
      const pageState = getOrCreatePageState(pages, pageNumber);

      pageState.canvas = canvas;
      pageState.context = canvas.getContext("2d");
      store.redrawPage(pageNumber);
      notifyChange();
    },

    reset() {
      pages.clear();
      clearHistory();
      nextAnnotationId = 1;
      notifyChange();
    },

    addStroke(pageNumber, stroke) {
      const annotation = appendAnnotation<StrokeAnnotation>(pageNumber, {
        id: stroke.id ?? nextId(),
        type: "stroke",
        color: stroke.color,
        width: stroke.width,
        points: stroke.points.map((point) => ({ ...point })),
      });

      return cloneStroke(annotation);
    },

    addText(pageNumber, textAnnotation) {
      const annotation = appendAnnotation<TextAnnotation>(pageNumber, {
        id: textAnnotation.id ?? nextId(),
        type: "text",
        text: textAnnotation.text,
        x: textAnnotation.x,
        y: textAnnotation.y,
        width: textAnnotation.width,
        height: textAnnotation.height,
        color: textAnnotation.color,
        fontSize: textAnnotation.fontSize,
        lineHeight: textAnnotation.lineHeight,
      });

      return cloneText(annotation);
    },

    updateText(pageNumber, annotationId, updates) {
      const pageState = pages.get(pageNumber);
      if (!pageState) return null;

      const index = pageState.annotations.findIndex(
        (annotation) =>
          annotation.id === annotationId && annotation.type === "text"
      );
      const before = pageState.annotations[index];
      if (!before || before.type !== "text") return null;

      const after: TextAnnotation = {
        ...before,
        ...updates,
        id: before.id,
        type: "text",
      };

      pageState.annotations[index] = after;
      undoStack.push({
        type: "update",
        pageNumber,
        before,
        after,
        index,
      });
      redoStack.length = 0;
      store.redrawPage(pageNumber);
      notifyChange();
      return cloneText(after);
    },

    eraseAnnotationAt(pageNumber, point, tolerance = 8) {
      const pageState = pages.get(pageNumber);
      if (!pageState?.annotations.length) return false;

      for (
        let index = pageState.annotations.length - 1;
        index >= 0;
        index -= 1
      ) {
        const annotation = pageState.annotations[index];
        if (!annotation) continue;

        if (!isPointInAnnotation(point, annotation, tolerance)) {
          continue;
        }

        pageState.annotations.splice(index, 1);
        undoStack.push({
          type: "remove",
          pageNumber,
          annotation,
          index,
        });
        redoStack.length = 0;
        store.redrawPage(pageNumber);
        notifyChange();
        return true;
      }

      return false;
    },

    getTextAt(pageNumber, point, tolerance = 3) {
      const pageState = pages.get(pageNumber);
      if (!pageState) return null;

      for (
        let index = pageState.annotations.length - 1;
        index >= 0;
        index -= 1
      ) {
        const annotation = pageState.annotations[index];

        if (
          annotation?.type === "text" &&
          isPointInText(point, annotation, tolerance)
        ) {
          return cloneText(annotation);
        }
      }

      return null;
    },

    removeAnnotation(pageNumber, annotationId) {
      const pageState = pages.get(pageNumber);
      if (!pageState) return false;

      const index = pageState.annotations.findIndex(
        (annotation) => annotation.id === annotationId
      );
      if (index === -1) return false;

      const annotation = pageState.annotations[index];
      if (!annotation) return false;

      pageState.annotations.splice(index, 1);
      undoStack.push({
        type: "remove",
        pageNumber,
        annotation,
        index,
      });
      redoStack.length = 0;
      store.redrawPage(pageNumber);
      notifyChange();
      return true;
    },

    undo() {
      const action = undoStack.pop();
      if (!action) return;

      if (undoAction(pages, action)) {
        store.redrawPage(action.pageNumber);
      }

      redoStack.push(action);
      notifyChange();
    },

    redo() {
      const action = redoStack.pop();
      if (!action) return;

      if (redoAction(pages, action)) {
        store.redrawPage(action.pageNumber);
      }

      undoStack.push(action);
      notifyChange();
    },

    redrawPage(pageNumber, draftStroke = null, excludedAnnotationId = null) {
      const pageState = pages.get(pageNumber);
      if (!pageState?.canvas || !pageState.context) return;

      const { canvas, context, annotations } = pageState;
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (const annotation of annotations) {
        if (annotation.id === excludedAnnotationId) {
          continue;
        }

        drawAnnotation(context, annotation);
      }

      if (draftStroke) {
        drawStroke(context, draftStroke);
      }
    },

    redrawAll() {
      for (const pageNumber of pages.keys()) {
        store.redrawPage(pageNumber);
      }
    },

    getAnnotationsByPage() {
      const annotationsByPage = new Map<number, Annotation[]>();

      for (const [pageNumber, pageState] of pages) {
        if (pageState.annotations.length > 0) {
          annotationsByPage.set(
            pageNumber,
            pageState.annotations.map(cloneAnnotation)
          );
        }
      }

      return annotationsByPage;
    },

    canUndo() {
      return undoStack.length > 0;
    },

    canRedo() {
      return redoStack.length > 0;
    },

    getAnnotationCount() {
      let count = 0;

      for (const pageState of pages.values()) {
        count += pageState.annotations.length;
      }

      return count;
    },
  };

  return store;
}

function getOrCreatePageState(
  pages: Map<number, PageState>,
  pageNumber: number
): PageState {
  const existingPage = pages.get(pageNumber);
  if (existingPage) {
    return existingPage;
  }

  const pageState: PageState = {
    canvas: null,
    context: null,
    annotations: [],
  };
  pages.set(pageNumber, pageState);
  return pageState;
}

function undoAction(
  pages: Map<number, PageState>,
  action: AnnotationHistoryAction
): boolean {
  switch (action.type) {
    case "add":
      return removeStoredAnnotation(
        pages,
        action.pageNumber,
        action.annotation
      );
    case "remove":
      return insertAnnotation(
        pages,
        action.pageNumber,
        action.annotation,
        action.index
      );
    case "update":
      return replaceAnnotation(
        pages,
        action.pageNumber,
        action.after,
        action.before,
        action.index
      );
  }
}

function redoAction(
  pages: Map<number, PageState>,
  action: AnnotationHistoryAction
): boolean {
  switch (action.type) {
    case "add":
      return insertAnnotation(
        pages,
        action.pageNumber,
        action.annotation,
        action.index
      );
    case "remove":
      return removeStoredAnnotation(
        pages,
        action.pageNumber,
        action.annotation
      );
    case "update":
      return replaceAnnotation(
        pages,
        action.pageNumber,
        action.before,
        action.after,
        action.index
      );
  }
}

function insertAnnotation(
  pages: Map<number, PageState>,
  pageNumber: number,
  annotation: Annotation,
  index: number
): boolean {
  const pageState = getOrCreatePageState(pages, pageNumber);
  const insertionIndex = Math.min(
    Math.max(index, 0),
    pageState.annotations.length
  );

  pageState.annotations.splice(insertionIndex, 0, annotation);
  return true;
}

function removeStoredAnnotation(
  pages: Map<number, PageState>,
  pageNumber: number,
  annotation: Annotation
): boolean {
  const pageState = pages.get(pageNumber);
  if (!pageState) return false;

  const index = pageState.annotations.findIndex(
    (candidate) => candidate.id === annotation.id
  );
  if (index === -1) return false;

  pageState.annotations.splice(index, 1);
  return true;
}

function replaceAnnotation(
  pages: Map<number, PageState>,
  pageNumber: number,
  expected: TextAnnotation,
  replacement: TextAnnotation,
  fallbackIndex: number
): boolean {
  const pageState = pages.get(pageNumber);
  if (!pageState) return false;

  const index = pageState.annotations.findIndex(
    (candidate) => candidate.id === expected.id
  );
  const replacementIndex = index === -1 ? fallbackIndex : index;

  if (
    replacementIndex < 0 ||
    replacementIndex >= pageState.annotations.length
  ) {
    return false;
  }

  pageState.annotations[replacementIndex] = replacement;
  return true;
}

function cloneStroke(annotation: StrokeAnnotation): StrokeAnnotation {
  return {
    ...annotation,
    points: annotation.points.map((point) => ({ ...point })),
  };
}

function cloneText(annotation: TextAnnotation): TextAnnotation {
  return { ...annotation };
}

function cloneAnnotation(annotation: Annotation): Annotation {
  return annotation.type === "text"
    ? cloneText(annotation)
    : cloneStroke(annotation);
}
