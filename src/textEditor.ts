import type { AnnotationStore } from "./annotationStore";
import { getCanvasDisplayScale } from "./domain/canvasCoordinates";
import type { PenSettings, Point, TextAnnotation } from "./domain/types";

export const TEXT_FONT_SIZE = 24;
export const TEXT_LINE_HEIGHT = 28.8;

const TEXT_EDITOR_MIN_WIDTH = 72;
const TEXT_EDITOR_PADDING = 8;

export interface TextEditorPage {
  pageNumber: number;
  pageShell: HTMLElement;
  annotationCanvas: HTMLCanvasElement;
}

export interface OpenTextEditorInput {
  page: TextEditorPage;
  point: Point;
  /** The annotation being edited, or null when placing new text. */
  annotation: TextAnnotation | null;
  penSettings: PenSettings;
  annotationStore: AnnotationStore;
  onDraftChange: (hasDraft: boolean) => void;
  onStatusChange: (message: string) => void;
  /** Called once the editor has committed or discarded and detached itself. */
  onClose: () => void;
}

export interface TextEditorSession {
  readonly pageNumber: number;
  readonly element: HTMLTextAreaElement;
  close(options: { commit: boolean }): void;
}

/**
 * Owns one text-annotation editing session: the textarea overlay, its
 * measurement against the annotation canvas, and the commit/discard rules.
 */
export function openTextEditor({
  page,
  point,
  annotation,
  penSettings,
  annotationStore,
  onDraftChange,
  onStatusChange,
  onClose,
}: OpenTextEditorInput): TextEditorSession {
  const element = document.createElement("textarea");
  const isEditing = Boolean(annotation);
  const canvas = page.annotationCanvas;
  const color = annotation?.color ?? penSettings.color;
  const fontSize = annotation?.fontSize ?? TEXT_FONT_SIZE;
  const lineHeight = annotation?.lineHeight ?? TEXT_LINE_HEIGHT;

  let x = annotation?.x ?? point.x;
  let y = annotation?.y ?? point.y;
  let width = annotation?.width ?? 0;
  let height = annotation?.height ?? 0;
  let isCommitting = false;

  element.className = "text-editor";
  element.setAttribute(
    "aria-label",
    isEditing ? "edit text annotation" : "new text annotation"
  );
  element.setAttribute("wrap", "off");
  element.spellcheck = true;
  element.value = annotation?.text ?? "";
  element.style.color = color;

  const handleInput = (): void => {
    resize();

    if (!annotation) {
      onDraftChange(element.value.trim().length > 0);
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close({ commit: true });
      return;
    }

    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      close({ commit: true });
    }
  };

  const handleBlur = (): void => {
    close({ commit: true });
  };

  function resize(): void {
    const context = canvas.getContext("2d");
    const lines = normalizeText(element.value).split("\n");
    const displayScale = getCanvasDisplayScale(canvas);

    let measuredWidth = fontSize * 2;

    if (context) {
      context.save();
      context.font = `${fontSize}px Helvetica, Arial, sans-serif`;
      measuredWidth = Math.max(
        measuredWidth,
        ...lines.map((line) => context.measureText(line || " ").width)
      );
      context.restore();
    }

    const measuredHeight = Math.max(lineHeight, lines.length * lineHeight);
    const maxX = Math.max(0, canvas.width - measuredWidth);
    const maxY = Math.max(0, canvas.height - measuredHeight);

    if (annotation) {
      x = clamp(x, 0, canvas.width);
      y = clamp(y, 0, canvas.height);
    } else {
      x = clamp(x, 0, maxX);
      y = clamp(y, 0, maxY);
    }

    const availableWidth = Math.max(fontSize, canvas.width - x);
    const availableHeight = Math.max(lineHeight, canvas.height - y);
    const editorWidth = Math.min(
      Math.max(measuredWidth + TEXT_EDITOR_PADDING * 2, TEXT_EDITOR_MIN_WIDTH),
      availableWidth
    );
    const editorHeight = Math.min(
      measuredHeight + TEXT_EDITOR_PADDING,
      availableHeight
    );

    width = Math.min(measuredWidth, availableWidth);
    height = Math.min(measuredHeight, availableHeight);

    element.style.left = `${x * displayScale.x}px`;
    element.style.top = `${y * displayScale.y}px`;
    element.style.width = `${editorWidth * displayScale.x}px`;
    element.style.height = `${editorHeight * displayScale.y}px`;
    element.style.fontSize = `${fontSize * displayScale.y}px`;
    element.style.lineHeight = `${lineHeight * displayScale.y}px`;
    element.style.padding = `${(TEXT_EDITOR_PADDING / 2) * displayScale.y}px`;
  }

  function close({ commit }: { commit: boolean }): void {
    if (isCommitting) {
      return;
    }

    isCommitting = true;
    onDraftChange(false);
    element.removeEventListener("input", handleInput);
    element.removeEventListener("keydown", handleKeyDown);
    element.removeEventListener("blur", handleBlur);
    element.remove();

    if (!commit) {
      annotationStore.redrawPage(page.pageNumber);
      onClose();
      return;
    }

    const text = normalizeText(element.value);
    const isBlank = text.trim().length === 0;

    if (annotation) {
      if (isBlank) {
        annotationStore.removeAnnotation(page.pageNumber, annotation.id);
      } else if (
        text !== annotation.text ||
        width !== annotation.width ||
        height !== annotation.height
      ) {
        annotationStore.updateText(page.pageNumber, annotation.id, {
          text,
          width,
          height,
        });
      } else {
        annotationStore.redrawPage(page.pageNumber);
      }
    } else if (isBlank) {
      annotationStore.redrawPage(page.pageNumber);
    } else {
      annotationStore.addText(page.pageNumber, {
        text,
        x,
        y,
        width,
        height,
        color,
        fontSize,
        lineHeight,
      });
    }

    onClose();
  }

  element.addEventListener("input", handleInput);
  element.addEventListener("keydown", handleKeyDown);
  element.addEventListener("blur", handleBlur);
  page.pageShell.append(element);

  if (annotation) {
    annotationStore.redrawPage(page.pageNumber, null, annotation.id);
  }

  resize();
  onStatusChange(isEditing ? "editing text" : "adding text");
  element.focus();
  element.setSelectionRange(element.value.length, element.value.length);

  return {
    pageNumber: page.pageNumber,
    element,
    close,
  };
}

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
