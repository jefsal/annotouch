export type AnnotationId = string;
export type Theme = "light" | "night";
export type Tool = "pen" | "eraser" | "text";

export interface Point {
  x: number;
  y: number;
}

interface BaseAnnotation {
  id: AnnotationId;
  color: string;
}

export interface StrokeAnnotation extends BaseAnnotation {
  type: "stroke";
  width: number;
  points: Point[];
}

export interface TextAnnotation extends BaseAnnotation {
  type: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
}

/** An axis-aligned rectangle in canvas-pixel space. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A translucent band over selected PDF text. One rect per line fragment; the
 * selected text is kept so export can write it into the PDF annotation.
 */
export interface HighlightAnnotation extends BaseAnnotation {
  type: "highlight";
  rects: Rect[];
  text: string;
}

export type Annotation =
  StrokeAnnotation | TextAnnotation | HighlightAnnotation;

export type StrokeDraft = Omit<StrokeAnnotation, "id" | "type"> & {
  id?: AnnotationId;
  type?: "stroke";
};

export type TextAnnotationDraft = Omit<TextAnnotation, "id" | "type"> & {
  id?: AnnotationId;
  type?: "text";
};

export type HighlightDraft = Omit<HighlightAnnotation, "id"> & {
  id?: AnnotationId;
};

export interface PageAnnotations {
  pageNumber: number;
  annotations: Annotation[];
}

export type AnnotationHistoryAction =
  | {
      type: "add" | "remove";
      pageNumber: number;
      annotation: Annotation;
      index: number;
    }
  | {
      type: "update";
      pageNumber: number;
      before: TextAnnotation;
      after: TextAnnotation;
      index: number;
    };

export interface PenSettings {
  color: string;
  width: number;
}

export type DocumentState =
  | { status: "idle" }
  | { status: "loading"; fileName: string }
  | {
      status: "ready";
      fileName: string;
      totalPageCount: number;
      annotatablePageCount: number;
    }
  | { status: "error"; message: string };
