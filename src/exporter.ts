import {
  degrees,
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

import type { Annotation, TextAnnotation } from "./domain/types";

export interface PdfViewport {
  rotation: number;
  convertToPdfPoint(x: number, y: number): readonly number[];
}

export interface BuildAnnotatedPdfInput {
  originalBytes: ArrayBuffer | Uint8Array;
  annotationsByPage: ReadonlyMap<number, readonly Annotation[]>;
  pageViewports: ReadonlyMap<number, PdfViewport>;
  scale: number;
}

export interface ExportAnnotatedPdfInput extends BuildAnnotatedPdfInput {
  sourceFileName: string;
}

interface UnsupportedTextCharacterErrorInput {
  character: string;
  pageNumber: number;
}

export class UnsupportedTextCharacterError extends Error {
  readonly character: string;
  readonly codePoint: number;
  readonly pageNumber: number;

  constructor({
    character,
    pageNumber,
  }: UnsupportedTextCharacterErrorInput) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new TypeError("character must contain at least one code point");
    }

    const codePointLabel = `U+${codePoint
      .toString(16)
      .toUpperCase()
      .padStart(4, "0")}`;

    super(
      `cannot export “${character}” (${codePointLabel}) on page ${pageNumber}; Helvetica does not support this character`
    );
    this.name = "UnsupportedTextCharacterError";
    this.character = character;
    this.codePoint = codePoint;
    this.pageNumber = pageNumber;
  }
}

export async function buildAnnotatedPdf({
  originalBytes,
  annotationsByPage,
  pageViewports,
  scale,
}: BuildAnnotatedPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();
  const hasTextAnnotations = [...annotationsByPage.values()].some(
    (annotations) =>
      annotations.some((annotation) => annotation.type === "text")
  );
  const textFont = hasTextAnnotations
    ? await pdfDoc.embedFont(StandardFonts.Helvetica)
    : null;

  if (textFont) {
    validateTextAnnotations(annotationsByPage, textFont);
  }

  for (const [pageNumber, annotations] of annotationsByPage) {
    const page = pages[pageNumber - 1];
    const viewport = pageViewports.get(pageNumber);

    if (!page || !viewport) continue;

    for (const annotation of annotations) {
      const color = hexToRgb(annotation.color);

      if (annotation.type === "text") {
        if (!textFont) {
          throw new Error("text font was not initialized");
        }

        drawTextAnnotation({
          annotation,
          color,
          font: textFont,
          page,
          scale,
          viewport,
        });
        continue;
      }

      drawStrokeAnnotation({
        annotation,
        color,
        page,
        scale,
        viewport,
      });
    }
  }

  return pdfDoc.save();
}

export async function exportAnnotatedPdf(
  input: ExportAnnotatedPdfInput
): Promise<void> {
  const bytes = await buildAnnotatedPdf(input);
  downloadBytes(bytes, getExportName(input.sourceFileName));
}

function validateTextAnnotations(
  annotationsByPage: ReadonlyMap<number, readonly Annotation[]>,
  font: PDFFont
): void {
  const supportedCodePoints = new Set(font.getCharacterSet());

  for (const [pageNumber, annotations] of annotationsByPage) {
    for (const annotation of annotations) {
      if (annotation.type !== "text") continue;

      for (const character of annotation.text) {
        if (character === "\n") continue;

        const codePoint = character.codePointAt(0);
        if (codePoint === undefined || !supportedCodePoints.has(codePoint)) {
          throw new UnsupportedTextCharacterError({
            character,
            pageNumber,
          });
        }
      }
    }
  }
}

interface DrawAnnotationInput<TAnnotation extends Annotation> {
  annotation: TAnnotation;
  color: RGB;
  page: PDFPage;
  scale: number;
  viewport: PdfViewport;
}

function drawStrokeAnnotation({
  annotation,
  color,
  page,
  scale,
  viewport,
}: DrawAnnotationInput<Extract<Annotation, { type: "stroke" }>>): void {
  for (let index = 1; index < annotation.points.length; index += 1) {
    const start = annotation.points[index - 1];
    const end = annotation.points[index];
    if (!start || !end) continue;

    const [startX, startY] = convertToPdfPoint(viewport, start.x, start.y);
    const [endX, endY] = convertToPdfPoint(viewport, end.x, end.y);

    page.drawLine({
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      thickness: annotation.width / scale,
      color,
    });
  }
}

interface DrawTextAnnotationInput
  extends DrawAnnotationInput<TextAnnotation> {
  font: PDFFont;
}

function drawTextAnnotation({
  annotation,
  color,
  font,
  page,
  scale,
  viewport,
}: DrawTextAnnotationInput): void {
  const fontSize = annotation.fontSize / scale;
  const rotation = degrees(viewport.rotation);

  annotation.text.split("\n").forEach((line, index) => {
    if (line.length === 0) return;

    const baselineY =
      annotation.y + annotation.fontSize + index * annotation.lineHeight;
    const [x, y] = convertToPdfPoint(viewport, annotation.x, baselineY);

    page.drawText(line, {
      x,
      y,
      size: fontSize,
      font,
      color,
      rotate: rotation,
    });
  });
}

export function hexToRgb(hex: string): RGB {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new TypeError(`invalid RGB hex color: ${hex}`);
  }

  const value = hex.slice(1);
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255
  );
}

export function getExportName(sourceFileName: string): string {
  return sourceFileName.replace(/\.pdf$/i, "") + "-annotated.pdf";
}

function convertToPdfPoint(
  viewport: PdfViewport,
  x: number,
  y: number
): [number, number] {
  const point = viewport.convertToPdfPoint(x, y);
  const convertedX = point[0];
  const convertedY = point[1];

  if (convertedX === undefined || convertedY === undefined) {
    throw new Error("PDF viewport returned an invalid point");
  }

  return [convertedX, convertedY];
}

function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}
