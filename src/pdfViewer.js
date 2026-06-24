import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function loadPdfDocument({ bytes }) {
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });

  return loadingTask.promise;
}

export async function renderPdfPage({ pdf, pageNumber, canvas, scale }) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext("2d");
  const width = Math.floor(viewport.width);
  const height = Math.floor(viewport.height);

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  context.clearRect(0, 0, width, height);

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  return {
    page,
    pageNumber,
    viewport,
    scale,
    width,
    height,
  };
}
