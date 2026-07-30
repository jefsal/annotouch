import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  PageViewport,
} from "pdfjs-dist";

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
