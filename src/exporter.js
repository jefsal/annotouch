import { PDFDocument, rgb } from "pdf-lib";

export async function exportAnnotatedPdf({
  originalBytes,
  strokesByPage,
  pageViewports,
  scale,
  sourceFileName,
}) {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();

  for (const [pageNumber, strokes] of strokesByPage) {
    const page = pages[pageNumber - 1];
    const viewport = pageViewports.get(pageNumber);

    if (!page || !viewport) continue;

    for (const stroke of strokes) {
      const color = hexToRgb(stroke.color);

      for (let index = 1; index < stroke.points.length; index += 1) {
        const start = stroke.points[index - 1];
        const end = stroke.points[index];
        const [startX, startY] = viewport.convertToPdfPoint(start.x, start.y);
        const [endX, endY] = viewport.convertToPdfPoint(end.x, end.y);

        page.drawLine({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          thickness: stroke.width / scale,
          color: rgb(color.r, color.g, color.b),
        });
      }
    }
  }

  const bytes = await pdfDoc.save();
  downloadBytes(bytes, getExportName(sourceFileName));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16) / 255;
  const g = Number.parseInt(value.slice(2, 4), 16) / 255;
  const b = Number.parseInt(value.slice(4, 6), 16) / 255;

  return { r, g, b };
}

function getExportName(sourceFileName) {
  return sourceFileName.replace(/\.pdf$/i, "") + "-annotated.pdf";
}

function downloadBytes(bytes, fileName) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();

  URL.revokeObjectURL(url);
}
