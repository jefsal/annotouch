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

  test("opens and closes the settings overlay", async ({ page }) => {
    const settingsButton = page.getByRole("button", { name: "settings" });
    const settingsPanel = page.getByRole("dialog", { name: "settings" });

    await expect(settingsButton).toBeVisible();
    await expect(settingsButton).toHaveAttribute("aria-expanded", "false");
    await expect(settingsPanel).toBeHidden();

    await settingsButton.click();

    await expect(settingsPanel).toBeVisible();
    await expect(settingsButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("show undo/redo")).toBeChecked();

    await page.keyboard.press("Escape");

    await expect(settingsPanel).toBeHidden();
    await expect(settingsButton).toHaveAttribute("aria-expanded", "false");

    await settingsButton.click();
    await expect(settingsPanel).toBeVisible();

    await page.mouse.click(20, 120);

    await expect(settingsPanel).toBeHidden();
    await expect(settingsButton).toHaveAttribute("aria-expanded", "false");
  });

  test("keeps the settings button visible at narrow widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 340, height: 640 });

    const settingsButton = page.getByRole("button", { name: "settings" });
    const settingsButtonBox = await settingsButton.boundingBox();

    await expect(settingsButton).toBeVisible();
    expect(settingsButtonBox).not.toBeNull();
    expect(settingsButtonBox.x).toBeGreaterThanOrEqual(0);
    expect(settingsButtonBox.y).toBeGreaterThanOrEqual(0);
    expect(settingsButtonBox.x + settingsButtonBox.width).toBeLessThanOrEqual(
      340
    );
    expect(settingsButtonBox.y + settingsButtonBox.height).toBeLessThanOrEqual(
      640
    );
  });

  test("adapts the toolbar title width at narrow widths", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 540, height: 720 });

    const toolbar = page.locator(".toolbar");
    const exportButton = page.getByRole("button", { name: "export" });

    await expect(page.locator(".history-controls")).toBeHidden();
    await expect(page.locator("#status")).toBeHidden();
    await expect(exportButton).toBeVisible();

    const emptyToolbarBox = await toolbar.boundingBox();
    expect(emptyToolbarBox).not.toBeNull();
    expect(emptyToolbarBox.height).toBeLessThanOrEqual(64);

    const fixturePath = await createPdfFixture(testInfo, 1);
    const longFileName =
      "semester-notes-with-a-long-file-name-for-toolbar-testing.pdf";
    const longFixturePath = testInfo.outputPath("fixtures", longFileName);

    await writeFile(longFixturePath, await readFile(fixturePath));
    await uploadPdf(page, longFixturePath, 1);

    await expect(page.locator("#document-name")).toHaveText(longFileName);
    await expect(page.locator("#document-count")).toBeHidden();
    await expect(page.locator(".history-controls")).toBeHidden();
    await expect(page.locator("#status")).toBeHidden();
    await expect(exportButton).toBeVisible();

    const loadedToolbarBox = await toolbar.boundingBox();
    const summaryBox = await page.locator("#document-summary").boundingBox();

    expect(loadedToolbarBox).not.toBeNull();
    expect(summaryBox).not.toBeNull();
    expect(loadedToolbarBox.height).toBeLessThanOrEqual(64);
    expect(summaryBox.width).toBeLessThanOrEqual(100);

    await page.setViewportSize({ width: 600, height: 720 });

    const widerToolbarBox = await toolbar.boundingBox();
    const widerSummaryBox = await page.locator("#document-summary").boundingBox();

    expect(widerToolbarBox).not.toBeNull();
    expect(widerSummaryBox).not.toBeNull();
    expect(widerToolbarBox.height).toBeLessThanOrEqual(64);
    expect(widerSummaryBox.width).toBeGreaterThanOrEqual(150);
    expect(widerSummaryBox.width).toBeLessThanOrEqual(180);
    await expect(page.locator("#document-name")).toHaveCSS("font-size", "13px");
    await expect(page.locator("#document-count")).toBeVisible();
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 0 strokes"
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

  test("hides undo/redo controls from settings while preserving keyboard history and persistence", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);

    const historyControls = page.locator(".history-controls");
    const settingsButton = page.getByRole("button", { name: "settings" });
    const settingsPanel = page.getByRole("dialog", { name: "settings" });
    const showHistoryControls = page.getByLabel("show undo/redo");
    const annotationCanvas = page.locator(".annotation-canvas").first();

    await page.getByRole("button", { name: "red pen" }).click();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await expect(historyControls).toBeVisible();
    await expect(page.getByRole("button", { name: "undo" })).toBeEnabled();

    await settingsButton.click();
    await expect(settingsPanel).toBeVisible();
    await showHistoryControls.uncheck();

    await expect(historyControls).toBeHidden();
    await expect(page.locator("#app")).toHaveClass(/hide-history-controls/);

    await page.keyboard.press("Escape");
    await expect(settingsPanel).toBeHidden();

    await page.keyboard.press("Control+Z");
    await expectCanvasToBeEmpty(annotationCanvas);

    await page.keyboard.press("Control+Shift+Z");
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);

    await page.reload();

    await expect(page.locator(".history-controls")).toBeHidden();
    await expect(page.locator("#app")).toHaveClass(/hide-history-controls/);

    await page.getByRole("button", { name: "settings" }).click();
    await expect(page.getByLabel("show undo/redo")).not.toBeChecked();
  });

  test("draws colors, preserves prior strokes, supports undo, redo, and exports colored PDF", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    await expect(page.getByRole("button", { name: "undo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "redo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "export" })).toBeEnabled();

    const annotationCanvas = page.locator(".annotation-canvas").first();

    await page.getByRole("button", { name: "red pen" }).click();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await expect(page.getByRole("button", { name: "undo" })).toBeEnabled();
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

    await uploadPdf(page, exportedPath, 1);
    const pdfCanvas = page.locator(".pdf-canvas").first();

    for (const color of PEN_COLORS) {
      await expectCanvasHasColor(pdfCanvas, color);
    }
  });

  test("erases whole strokes with E and supports undo, redo, and export", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);

    const annotationCanvas = page.locator(".annotation-canvas").first();
    const documentCount = page.locator("#document-count");

    await page.getByRole("button", { name: "red pen" }).click();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await page.getByRole("button", { name: "green pen" }).click();
    await drawStroke(page, annotationCanvas, PEN_COLORS[2].y);

    await expect(documentCount).toHaveText("1/1 pages | 2 strokes");
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await page.getByRole("combobox", { name: "stroke width" }).focus();
    await moveWithEraserKey(page, annotationCanvas, PEN_COLORS[1].y, {
      expectActive: false,
    });
    await expect(page.getByRole("status")).toHaveText("ready");
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await page.evaluate(() => document.activeElement?.blur());

    await eraseStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await expect(documentCount).toHaveText("1/1 pages | 1 stroke");
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await page.keyboard.press("Control+Z");
    await expect(documentCount).toHaveText("1/1 pages | 2 strokes");
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await page.keyboard.press("Control+Shift+Z");
    await expect(documentCount).toHaveText("1/1 pages | 1 stroke");
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await eraseStroke(page, annotationCanvas, PEN_COLORS[2].y);
    await expect(documentCount).toHaveText("1/1 pages | 0 strokes");
    await expectCanvasToBeEmpty(annotationCanvas);

    await page.keyboard.press("Control+Z");
    await expect(documentCount).toHaveText("1/1 pages | 1 stroke");
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "export" }).click(),
    ]);

    expect(download.suggestedFilename()).toBe("fixture-1-page-annotated.pdf");

    const exportedPath = testInfo.outputPath("fixture-1-page-erased.pdf");
    await download.saveAs(exportedPath);
    await expectPdfPageCount(exportedPath, 1);

    await uploadPdf(page, exportedPath, 1);
    const pdfCanvas = page.locator(".pdf-canvas").first();

    await expectCanvasLacksColor(pdfCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(pdfCanvas, PEN_COLORS[2]);
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
      await page.getByRole("button", { name: "undo" }).click();
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

  await expect(page.locator("#status")).toHaveText(statusText, {
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

async function eraseStroke(page, canvas, y) {
  await moveWithEraserKey(page, canvas, y, { expectActive: true });
}

async function moveWithEraserKey(page, canvas, y, { expectActive }) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const startX = Math.min(110, box.width - 60);
  const endX = Math.min(360, box.width - 30);
  const eraseY = Math.min(y, box.height - 30);

  await page.mouse.move(box.x + startX, box.y + eraseY);
  await page.keyboard.down("e");

  if (expectActive) {
    await expect(page.getByRole("status")).toHaveText("erasing");
  }

  await page.mouse.move(box.x + endX, box.y + eraseY, { steps: 12 });
  await page.keyboard.up("e");

  if (expectActive) {
    await expect(page.getByRole("status")).toHaveText("ready");
  }
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
