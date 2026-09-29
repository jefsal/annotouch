import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

import type { MeasureText, TextRun } from "./domain/textSelection";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfPageViewportResult {
  page: PDFPageProxy;
  pageNumber: number;
  viewport: PageViewport;
  scale: number;
  width: number;
  height: number;
}

interface LoadPdfDocumentInput {
  bytes: ArrayBuffer | Uint8Array;
}

interface PdfPageInput {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}

interface RenderPdfPageInput extends PdfPageInput {
  canvas: HTMLCanvasElement;
}

export async function loadPdfDocument({
  bytes,
}: LoadPdfDocumentInput): Promise<PDFDocumentProxy> {
  const data =
    bytes instanceof ArrayBuffer ? bytes.slice(0) : new Uint8Array(bytes);
  const loadingTask = pdfjsLib.getDocument({ data });

  return loadingTask.promise;
}

export async function getPdfPageViewport({
  pdf,
  pageNumber,
  scale,
}: PdfPageInput): Promise<PdfPageViewportResult> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  return {
    page,
    pageNumber,
    viewport,
    scale,
    width: Math.floor(viewport.width),
    height: Math.floor(viewport.height),
  };
}

export async function renderPdfPage({
  pdf,
  pageNumber,
  canvas,
  scale,
}: RenderPdfPageInput): Promise<PdfPageViewportResult> {
  const result = await getPdfPageViewport({
    pdf,
    pageNumber,
    scale,
  });
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("could not acquire a 2D canvas context");
  }

  canvas.width = result.width;
  canvas.height = result.height;
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  context.clearRect(0, 0, result.width, result.height);

  await result.page.render({
    canvasContext: context,
    viewport: result.viewport,
  }).promise;

  return result;
}

/** Used when PDF.js reports neither an ascent nor a descent for a font. */
const DEFAULT_FONT_ASCENT = 0.8;

/**
 * Reads a page's text content and maps every run into the viewport's
 * canvas-pixel space, following the placement rules of the PDF.js text layer.
 */
export async function getPdfPageTextRuns({
  page,
  viewport,
}: {
  page: PDFPageProxy;
  viewport: PageViewport;
}): Promise<TextRun[]> {
  const content = await page.getTextContent();
  const runs: TextRun[] = [];

  for (const item of content.items) {
    if (!isTextItem(item)) continue;

    if (item.str.length === 0) {
      // PDF.js emits empty items to mark line ends between runs.
      const previous = runs[runs.length - 1];
      if (previous && item.hasEOL) previous.hasEOL = true;
      continue;
    }

    const style = content.styles[item.fontName];
    const [a, b, c, d, x, y] = pdfjsLib.Util.transform(
      viewport.transform,
      item.transform
    ) as number[];
    if (
      a === undefined ||
      b === undefined ||
      c === undefined ||
      d === undefined ||
      x === undefined ||
      y === undefined
    ) {
      continue;
    }

    const angle = Math.atan2(b, a) + (style?.vertical ? Math.PI / 2 : 0);
    const fontHeight = Math.hypot(c, d);
    const ascentRatio = style?.ascent
      ? style.ascent
      : style?.descent
        ? 1 + style.descent
        : DEFAULT_FONT_ASCENT;

    runs.push({
      text: item.str,
      x,
      y,
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      length: (style?.vertical ? item.height : item.width) * viewport.scale,
      ascent: fontHeight * ascentRatio,
      descent: fontHeight * (1 - ascentRatio),
      fontFamily: style?.fontFamily ?? "sans-serif",
      hasEOL: item.hasEOL,
    });
  }

  return runs;
}

function isTextItem(item: object): item is TextItem {
  return "str" in item;
}

/**
 * Measures glyphs with a shared offscreen canvas, caching each advance. Falls
 * back to a uniform width where no 2D context exists.
 */
export function createCanvasTextMeasurer(): MeasureText {
  const context = document.createElement("canvas").getContext("2d");
  const cache = new Map<string, number>();

  return (text, fontFamily) => {
    if (!context) return 1;

    const key = `${fontFamily}\u0000${text}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    context.font = `100px ${fontFamily}`;
    const width = context.measureText(text).width;
    cache.set(key, width);
    return width;
  };
}
