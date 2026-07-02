import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PEN_COLORS = [
  { label: "black", hex: "#111827", y: 140 },
  { label: "red", hex: "#e11d48", y: 180 },
  { label: "green", hex: "#16a34a", y: 220 },
  { label: "blue", hex: "#2563eb", y: 260 },
  { label: "white", hex: "#ffffff", y: 300 },
];
const MAX_ANNOTATABLE_PAGES = 200;
const errorsByPage = new WeakMap();

test.describe("Annotouch browser QA", () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await page.goto("/");
    await expect(page.getByRole("status")).toHaveText("no PDF loaded");

    errorsByPage.set(page, { consoleErrors, pageErrors });
  });

  test.afterEach(async ({ page }) => {
    const errors = errorsByPage.get(page);
    expect(errors?.consoleErrors ?? []).toEqual([]);
    expect(errors?.pageErrors ?? []).toEqual([]);
  });

  test("matches the no PDF loaded status opacity to the disabled clear button", async ({
    page,
  }) => {
    const clearButton = page.getByRole("button", { name: "clear" });
    const status = page.getByRole("status");

    await expect(clearButton).toBeDisabled();
    await expect(clearButton).toHaveCSS("opacity", "0.36");
    await expect(status).toHaveText("no PDF loaded");
    await expect(status).toHaveCSS("opacity", "0.36");
  });

  test("toggles night mode from the annotouch brand and persists it", async ({
    page,
  }) => {
    await page.evaluate(() => {
      localStorage.setItem("annotouch-theme", "light");
    });
    await page.reload();

    const themeToggle = page.locator("#theme-toggle");
    const themeToggleBox = await themeToggle.boundingBox();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(themeToggle).toHaveText("annotouch");
    await expect(themeToggle).toHaveAttribute("aria-pressed", "false");
    await expect(themeToggle).toHaveCSS("cursor", "pointer");
    expect(themeToggleBox?.x).toBeLessThan(32);

    await themeToggle.click();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(themeToggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#app")).toHaveCSS(
      "filter",
      "invert(1) hue-rotate(180deg)"
    );
    await expect(page.locator("#app")).toHaveCSS(
      "background-color",
      "rgb(238, 241, 245)"
    );
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(17, 24, 39)"
    );

    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(page.locator("#theme-toggle")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  for (const pageCount of [1, 3, 25, 30]) {
    test(`uploads and exports a ${pageCount}-page fixture`, async ({
      page,
    }, testInfo) => {
      const fixturePath = await createPdfFixture(testInfo, pageCount);

      await uploadPdf(page, fixturePath, pageCount);

      await expect(page.locator(".page-shell")).toHaveCount(pageCount);

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "export" }).click(),
      ]);

      expect(download.suggestedFilename()).toBe(
        `fixture-${pageCount}-page-annotated.pdf`
      );

      const exportedPath = testInfo.outputPath(
        `fixture-${pageCount}-page-annotated.pdf`
      );
      await download.saveAs(exportedPath);
      await expectPdfPageCount(exportedPath, pageCount);
      await expect(page.getByRole("status")).toHaveText("exported");
    });
  }

  test("caps annotation shells at 200 pages while exporting the full PDF", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 205);

    await uploadPdf(page, fixturePath, 205);

    await expect(page.locator(".page-shell")).toHaveCount(MAX_ANNOTATABLE_PAGES);
    await expect(page.locator(".page-shell[data-page-number='200']")).toHaveCount(1);
    await expect(page.locator(".page-shell[data-page-number='201']")).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "export" }).click(),
    ]);

    expect(download.suggestedFilename()).toBe("fixture-205-page-annotated.pdf");

    const exportedPath = testInfo.outputPath("fixture-205-page-annotated.pdf");
    await download.saveAs(exportedPath);
    await expectPdfPageCount(exportedPath, 205);
  });

  test("renders pages lazily and exports strokes drawn on a later rendered page", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 30);

    await uploadPdf(page, fixturePath, 30);

    const initiallyRenderedPages = await page
      .locator(".page-shell[data-render-state='rendered']")
      .count();
    expect(initiallyRenderedPages).toBeGreaterThan(0);
    expect(initiallyRenderedPages).toBeLessThan(30);

    const page30Canvas = await scrollToRenderedAnnotationCanvas(page, 30);

    await page.getByRole("button", { name: "red pen" }).click();
    await drawStroke(page, page30Canvas, PEN_COLORS[1].y);
    await expectCanvasHasColor(page30Canvas, PEN_COLORS[1]);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "export" }).click(),
    ]);

    expect(download.suggestedFilename()).toBe("fixture-30-page-annotated.pdf");

    const exportedPath = testInfo.outputPath("fixture-30-page-annotated.pdf");
    await download.saveAs(exportedPath);
    await expectPdfPageCount(exportedPath, 30);

    await uploadPdf(page, exportedPath, 30);
    const exportedPage30Shell = await scrollToRenderedPageShell(page, 30);
    await expectCanvasHasColor(
      exportedPage30Shell.locator(".pdf-canvas"),
      PEN_COLORS[1]
    );
  });

  test("draws colors, preserves prior strokes, supports undo, redo, clear, and exports colored PDF", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    await expect(page.getByRole("button", { name: "undo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "redo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "clear" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "export" })).toBeEnabled();

    const annotationCanvas = page.locator(".annotation-canvas").first();

    await page.getByRole("button", { name: "red pen" }).click();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await expect(page.getByRole("button", { name: "undo" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "clear" })).toBeEnabled();
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);

    await page.getByRole("button", { name: "green pen" }).click();
    await drawStroke(page, annotationCanvas, PEN_COLORS[2].y);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await page.getByRole("button", { name: "undo" }).click();
    await expect(page.getByRole("button", { name: "redo" })).toBeEnabled();
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[2]);

    await page.getByRole("button", { name: "redo" }).click();
    await expect(page.getByRole("button", { name: "redo" })).toBeDisabled();
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await page.keyboard.press("Control+Z");
    await expect(page.getByRole("button", { name: "redo" })).toBeEnabled();
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[2]);

    await page.keyboard.press("Control+Shift+Z");
    await expect(page.getByRole("button", { name: "redo" })).toBeDisabled();
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await page.getByRole("button", { name: "undo" }).click();
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[2]);

    for (const color of [
      PEN_COLORS[2],
      PEN_COLORS[0],
      PEN_COLORS[3],
      PEN_COLORS[4],
    ]) {
      await page.getByRole("button", { name: `${color.label} pen` }).click();
      await drawStroke(page, annotationCanvas, color.y);
      await expect(page.getByRole("button", { name: "redo" })).toBeDisabled();
      await expectCanvasHasColor(annotationCanvas, color);
    }

    for (const color of PEN_COLORS) {
      await expectCanvasHasColor(annotationCanvas, color);
    }

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "export" }).click(),
    ]);

    expect(download.suggestedFilename()).toBe("fixture-1-page-annotated.pdf");

    const exportedPath = testInfo.outputPath("fixture-1-page-annotated.pdf");
    await download.saveAs(exportedPath);
    await expectPdfPageCount(exportedPath, 1);

    await page.getByRole("button", { name: "clear" }).click();
    await expectCanvasToBeEmpty(annotationCanvas);
    await expect(page.getByRole("button", { name: "undo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "redo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "clear" })).toBeDisabled();

    await uploadPdf(page, exportedPath, 1);
    const pdfCanvas = page.locator(".pdf-canvas").first();

    for (const color of PEN_COLORS) {
      await expectCanvasHasColor(pdfCanvas, color);
    }
  });

  test("applies selected stroke widths", async ({ page }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);

    const annotationCanvas = page.locator(".annotation-canvas").first();
    const widthOptions = [
      { label: "small", value: "2.5", y: 140 },
      { label: "med", value: "5", y: 180 },
      { label: "large", value: "10", y: 220 },
    ];
    const measuredInk = [];
    const widthSelect = page.getByRole("combobox", { name: "stroke width" });

    await expect(widthSelect).toHaveValue("2.5");

    for (const option of widthOptions) {
      await widthSelect.selectOption({ label: option.label });
      await expect(widthSelect).toHaveValue(option.value);
      await drawStroke(page, annotationCanvas, option.y);
      measuredInk.push(await measureStrokeInk(annotationCanvas, option.y));
      await page.getByRole("button", { name: "clear" }).click();
      await expectCanvasToBeEmpty(annotationCanvas);
    }

    expect(measuredInk[1]).toBeGreaterThan(measuredInk[0] * 1.6);
    expect(measuredInk[2]).toBeGreaterThan(measuredInk[1] * 1.6);
  });
});

async function createPdfFixture(testInfo, pageCount) {
  const fixtureDir = testInfo.outputPath("fixtures");
  await mkdir(fixtureDir, { recursive: true });

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const filePath = path.join(fixtureDir, `fixture-${pageCount}-page.pdf`);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdfDoc.addPage([420, 560]);
    const { width, height } = page.getSize();

    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: rgb(0.9, 0.92, 0.95),
    });
    page.drawText(`Annotouch QA fixture`, {
      x: 36,
      y: height - 54,
      size: 16,
      font,
      color: rgb(0.12, 0.14, 0.18),
    });
    page.drawText(`Page ${index + 1} of ${pageCount}`, {
      x: 36,
      y: height - 78,
      size: 11,
      font,
      color: rgb(0.32, 0.36, 0.42),
    });
  }

  const bytes = await pdfDoc.save();
  await testInfo.attach(`fixture-${pageCount}-page.pdf`, {
    body: Buffer.from(bytes),
    contentType: "application/pdf",
  });

  await writeFile(filePath, bytes);

  return filePath;
}

async function uploadPdf(page, filePath, pageCount) {
  await page.locator("#pdf-input").setInputFiles(filePath);

  const statusText =
    pageCount > MAX_ANNOTATABLE_PAGES
      ? `showing first ${MAX_ANNOTATABLE_PAGES} of ${pageCount} pages`
      : `${pageCount} page${pageCount === 1 ? "" : "s"} ready`;

  await expect(page.getByRole("status")).toHaveText(statusText, {
    timeout: 45_000,
  });

  await expect(page.locator(".page-shell").first()).toHaveAttribute(
    "data-render-state",
    "rendered"
  );
}

async function scrollToRenderedAnnotationCanvas(page, pageNumber) {
  const pageShell = await scrollToRenderedPageShell(page, pageNumber);
  const annotationCanvas = pageShell.locator(".annotation-canvas");
  await expect(annotationCanvas).toHaveCount(1);

  return annotationCanvas;
}

async function scrollToRenderedPageShell(page, pageNumber) {
  const pageShell = page.locator(`.page-shell[data-page-number='${pageNumber}']`);

  await expect(pageShell).toHaveCount(1);
  await pageShell.scrollIntoViewIfNeeded();
  await expect(pageShell).toHaveAttribute("data-render-state", "rendered", {
    timeout: 20_000,
  });

  return pageShell;
}

async function drawStroke(page, canvas, y) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const startX = Math.min(110, box.width - 60);
  const endX = Math.min(360, box.width - 30);
  const drawY = Math.min(y, box.height - 30);

  await page.keyboard.down("Space");
  await page.mouse.move(box.x + startX, box.y + drawY);
  await page.mouse.move(box.x + endX, box.y + drawY, { steps: 12 });
  await page.keyboard.up("Space");
  await expect(page.getByRole("status")).toHaveText("ready");
}

async function expectPdfPageCount(filePath, expectedPageCount) {
  const bytes = await readFile(filePath);
  const pdfDoc = await PDFDocument.load(bytes);

  expect(pdfDoc.getPageCount()).toBe(expectedPageCount);
}

async function expectCanvasHasColor(canvas, color) {
  await expect
    .poll(async () => countCanvasPixelsNearColor(canvas, color), {
      message: `${color.label} pixels should be present`,
    })
    .toBeGreaterThan(0);
}

async function expectCanvasLacksColor(canvas, color) {
  await expect
    .poll(async () => countCanvasPixelsNearColor(canvas, color), {
      message: `${color.label} pixels should be absent`,
    })
    .toBe(0);
}

async function expectCanvasToBeEmpty(canvas) {
  await expect
    .poll(async () => countOpaqueCanvasPixels(canvas), {
      message: "annotation canvas should be empty",
    })
    .toBe(0);
}

async function countCanvasPixelsNearColor(canvas, color) {
  const expected = hexToRgb(color.hex);

  return canvas.evaluate(
    (element, { expected, y }) => {
      const context = element.getContext("2d");
      const sampleY = Math.min(y, element.height - 30);
      const data = context.getImageData(80, sampleY - 8, 330, 16).data;
      let matchingPixels = 0;

      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];

        if (alpha < 80) continue;

        if (
          Math.abs(r - expected.r) <= 40 &&
          Math.abs(g - expected.g) <= 40 &&
          Math.abs(b - expected.b) <= 40
        ) {
          matchingPixels += 1;
        }
      }

      return matchingPixels;
    },
    { expected, y: color.y }
  );
}

async function countOpaqueCanvasPixels(canvas) {
  return canvas.evaluate((element) => {
    const context = element.getContext("2d");
    const data = context.getImageData(0, 0, element.width, element.height).data;
    let opaquePixels = 0;

    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 20) {
        opaquePixels += 1;
      }
    }

    return opaquePixels;
  });
}

async function measureStrokeInk(canvas, y) {
  return canvas.evaluate((element, y) => {
    const context = element.getContext("2d");
    const sampleY = Math.min(y, element.height - 30);
    const top = Math.max(0, sampleY - 18);
    const sampleHeight = Math.min(element.height - top, 37);
    const data = context.getImageData(80, top, 330, sampleHeight).data;
    let alphaTotal = 0;

    for (let index = 3; index < data.length; index += 4) {
      alphaTotal += data[index];
    }

    return alphaTotal;
  }, y);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}
