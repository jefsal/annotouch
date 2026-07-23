import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function exportAnnotatedPdf({
  originalBytes,
  annotationsByPage,
  pageViewports,
  scale,
  sourceFileName,
}) {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();
  let textFont = null;

  for (const [pageNumber, annotations] of annotationsByPage) {
    const page = pages[pageNumber - 1];
    const viewport = pageViewports.get(pageNumber);

    if (!page || !viewport) continue;

    for (const annotation of annotations) {
      const color = hexToRgb(annotation.color);

      if (annotation.type === "text") {
        textFont ??= await pdfDoc.embedFont(StandardFonts.Helvetica);
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

  const bytes = await pdfDoc.save();
  downloadBytes(bytes, getExportName(sourceFileName));
}

function drawStrokeAnnotation({ annotation, color, page, scale, viewport }) {
  for (let index = 1; index < annotation.points.length; index += 1) {
    const start = annotation.points[index - 1];
    const end = annotation.points[index];
    const [startX, startY] = viewport.convertToPdfPoint(start.x, start.y);
    const [endX, endY] = viewport.convertToPdfPoint(end.x, end.y);

    page.drawLine({
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      thickness: annotation.width / scale,
      color: rgb(color.r, color.g, color.b),
    });
  }
}

function drawTextAnnotation({
  annotation,
  color,
  font,
  page,
  scale,
  viewport,
}) {
  const fontSize = annotation.fontSize / scale;
  const lineHeight = annotation.lineHeight / scale;
  const [x, topY] = viewport.convertToPdfPoint(annotation.x, annotation.y);

  annotation.text.split("\n").forEach((line, index) => {
    if (line.length === 0) return;

    page.drawText(line, {
      x,
      y: topY - fontSize - index * lineHeight,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
    });
  });
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
