import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  buildAnnotatedPdf,
  getExportName,
  hexToRgb,
  UnsupportedTextCharacterError,
  type PdfViewport,
} from "../../src/exporter";
import type { Annotation } from "../../src/domain/types";

const identityViewport: PdfViewport = {
  rotation: 0,
  convertToPdfPoint: (x, y) => [x, y],
};

async function createSourcePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([300, 300]);
  return document.save();
}

describe("PDF export", () => {
  it("normalizes the downloaded file name", () => {
    expect(getExportName("notes.PDF")).toBe("notes-annotated.pdf");
    expect(getExportName("notes")).toBe("notes-annotated.pdf");
  });

  it("converts validated hex colors", () => {
    expect(hexToRgb("#ff8000")).toEqual({
      red: 1,
      green: 128 / 255,
      blue: 0,
      type: "RGB",
    });
    expect(() => hexToRgb("red")).toThrow("invalid RGB hex color");
  });

  it("builds a PDF from typed stroke and text annotations", async () => {
    const annotations: Annotation[] = [
      {
        id: "stroke-1",
        type: "stroke",
        color: "#e11d48",
        width: 4,
        points: [
          { x: 10, y: 10 },
          { x: 80, y: 80 },
        ],
      },
      {
        id: "text-1",
        type: "text",
        color: "#111827",
        text: "hello",
        x: 40,
        y: 50,
        width: 60,
        height: 24,
        fontSize: 20,
        lineHeight: 24,
      },
    ];

    const bytes = await buildAnnotatedPdf({
      originalBytes: await createSourcePdf(),
      annotationsByPage: new Map([[1, annotations]]),
      pageViewports: new Map([[1, identityViewport]]),
      scale: 1,
    });

    const exported = await PDFDocument.load(bytes);
    expect(exported.getPageCount()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("rejects text outside the standard export font", async () => {
    const unsupported: Annotation = {
      id: "text-1",
      type: "text",
      color: "#111827",
      text: "hello 😀",
      x: 40,
      y: 50,
      width: 60,
      height: 24,
      fontSize: 20,
      lineHeight: 24,
    };

    const error = await buildAnnotatedPdf({
      originalBytes: await createSourcePdf(),
      annotationsByPage: new Map([[1, [unsupported]]]),
      pageViewports: new Map([[1, identityViewport]]),
      scale: 1,
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(UnsupportedTextCharacterError);
    expect(error).toMatchObject({
      name: "UnsupportedTextCharacterError",
      character: "😀",
      codePoint: 0x1f600,
      pageNumber: 1,
    });
  });
});
