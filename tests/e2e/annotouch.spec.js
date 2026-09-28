import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { degrees, PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  getDocument as getPdfDocument,
  Util,
} from "pdfjs-dist/legacy/build/pdf.mjs";

const PEN_COLORS = [
  { label: "black", hex: "#111827", y: 140 },
  { label: "red", hex: "#e11d48", y: 180 },
  { label: "green", hex: "#16a34a", y: 220 },
  { label: "blue", hex: "#2563eb", y: 260 },
  { label: "white", hex: "#ffffff", y: 300 },
];
const MAX_ANNOTATABLE_PAGES = 200;
// Upper bounds on lazily rendered pages, kept well above the observed counts
// (3 at rest, 10 after scrolling) so they fail on a broken observer rather than
// on timing noise. Rendering is monotonic: a page is never released once drawn.
const NEARBY_RENDERED_PAGE_LIMIT = 6;
const SCROLLED_RENDERED_PAGE_LIMIT = 25;
const errorsByPage = new WeakMap();

async function clickToolbarControl(page, control) {
  const viewport = page.viewportSize();

  await page.mouse.move(
    Math.floor((viewport?.width ?? 800) / 2),
    Math.floor((viewport?.height ?? 600) / 2)
  );
  await expect(page.locator(".toolbar")).toHaveCSS("opacity", "1");
  await control.click();
}

/**
 * `pdf-lib` cannot produce any of these: it always writes a well-formed,
 * unencrypted document with at least one page, so each is written by hand.
 */
const UNLOADABLE_PDF_FIXTURES = [
  {
    label: "a malformed PDF",
    fileName: "malformed.pdf",
    bytes: () => Buffer.from("this is definitely not a pdf"),
  },
  {
    label: "a truncated PDF",
    fileName: "truncated.pdf",
    bytes: () =>
      Buffer.from("%PDF-1.4\n1 0 obj<< /Type /Catalog >>endobj\n", "latin1"),
  },
  {
    // The /O and /U digests are deliberately wrong, so the standard security
    // handler rejects the empty user password exactly as a real encrypted
    // document would.
    label: "an encrypted PDF",
    fileName: "encrypted.pdf",
    bytes: () =>
      Buffer.from(
        [
          "%PDF-1.4",
          "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
          "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
          "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>endobj",
          "4 0 obj<< /Filter /Standard /V 1 /R 2 " +
            "/O <0123456789ABCDEF0123456789ABCDEF> " +
            "/U <FEDCBA9876543210FEDCBA9876543210> /P -1 >>endobj",
          "trailer<< /Size 5 /Root 1 0 R /Encrypt 4 0 R /ID [<01> <02>] >>",
          "%%EOF",
          "",
        ].join("\n"),
        "latin1"
      ),
  },
  {
    // Structurally valid and loads cleanly in PDF.js; only the page count makes
    // it unusable, so the guard for it lives in the document controller.
    label: "a PDF with no pages",
    fileName: "zero-page.pdf",
    bytes: () =>
      Buffer.from(
        [
          "%PDF-1.4",
          "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
          "2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj",
          "trailer<< /Size 3 /Root 1 0 R >>",
          "%%EOF",
          "",
        ].join("\n"),
        "latin1"
      ),
  },
];

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

  test("uses the original PDF drop card", async ({ page }) => {
    const emptyState = page.locator("#empty-state");

    await expect(emptyState.getByText("drop a PDF")).toBeVisible();
    await expect(emptyState.getByText("or choose a local file")).toBeVisible();
    await expect(emptyState.getByText("choose PDF")).toBeVisible();
    await expect(emptyState).toHaveAttribute("for", "pdf-input");
    await expect(emptyState).toHaveCSS("border-style", "dashed");
  });

  test("shows the toolbar at session start and refreshes it from input anywhere", async ({
    page,
  }) => {
    await page.clock.install();
    await page.reload();

    const toolbar = page.locator(".toolbar");

    await expect(toolbar).toHaveClass(/translate-y-0/);
    await page.clock.fastForward(30_000);
    await expect(toolbar).toHaveClass(/-translate-y-full/);

    await page.keyboard.press("Shift");
    await expect(toolbar).toHaveClass(/translate-y-0/);

    await page.clock.fastForward(30_000);
    await expect(toolbar).toHaveClass(/-translate-y-full/);
    await page.mouse.move(400, 300);
    await expect(toolbar).toHaveClass(/translate-y-0/);

    await page.clock.fastForward(30_000);
    await expect(toolbar).toHaveClass(/-translate-y-full/);
    await page.mouse.wheel(0, 100);
    await expect(toolbar).toHaveClass(/translate-y-0/);

    await page.evaluate(() => {
      document.body.style.minHeight = `${window.innerHeight + 1}px`;
    });
    await page.clock.fastForward(30_000);
    await expect(toolbar).toHaveClass(/-translate-y-full/);
    await page.evaluate(() => window.scrollTo(0, 1));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1);
    await expect(toolbar).toHaveClass(/translate-y-0/);
  });

  test("centers the empty PDF prompt on the inverted light surfaces", async ({
    page,
  }) => {
    const workspace = page.getByRole("region", {
      name: "pdf annotation workspace",
    });
    const emptyState = page.locator("#empty-state");
    const workspaceBox = await workspace.boundingBox();
    const emptyStateBox = await emptyState.boundingBox();

    expect(workspaceBox).not.toBeNull();
    expect(emptyStateBox).not.toBeNull();
    expect(
      Math.abs(
        emptyStateBox.y +
          emptyStateBox.height / 2 -
          (workspaceBox.y + workspaceBox.height / 2)
      )
    ).toBeLessThanOrEqual(1);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)"
    );
    await expect(emptyState).toHaveCSS(
      "background-color",
      "rgba(255, 255, 255, 0)"
    );
    await expect(emptyState).toHaveCSS("backdrop-filter", "blur(10px)");
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
    await expect(themeToggle).toHaveAttribute("aria-keyshortcuts", "N");
    await expect(themeToggle).toHaveAttribute(
      "title",
      "switch to night mode (N)"
    );
    await expect(themeToggle).toHaveCSS("cursor", "pointer");
    expect(themeToggleBox?.x).toBeLessThan(32);

    await page.keyboard.press("n");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(themeToggle).toHaveAttribute(
      "title",
      "switch to light mode (N)"
    );

    await page.keyboard.press("n");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await clickToolbarControl(page, themeToggle);

    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(themeToggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    await expect(page.locator(".toolbar")).toHaveCSS(
      "color",
      "rgb(243, 244, 246)"
    );
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(17, 24, 39)"
    );
    await expect(page.locator("#app")).toHaveCSS("filter", "none");

    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(page.locator("#theme-toggle")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  test("toggles night mode with N outside editable controls", async ({
    page,
  }) => {
    await page.evaluate(() => {
      localStorage.setItem("annotouch-theme", "light");
    });
    await page.reload();

    const themeToggle = page.locator("#theme-toggle");

    await expect(themeToggle).toHaveAttribute("aria-keyshortcuts", "N");
    await page.keyboard.press("n");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await expect(themeToggle).toHaveAttribute("aria-pressed", "true");

    await page.locator("#pdf-input").focus();
    await page.keyboard.press("n");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");

    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("N");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(themeToggle).toHaveAttribute("aria-pressed", "false");
  });

  test("toggles and persists the background image from settings and shift+i", async ({
    page,
  }) => {
    const html = page.locator("html");
    const body = page.locator("body");
    const backgroundImageToggle = page.getByLabel("show background image");

    await expect(html).toHaveAttribute("data-background-image", "visible");
    await expect(body).toHaveCSS("background-image", /url\(/);

    await page.getByRole("button", { name: "settings" }).click();
    await expect(backgroundImageToggle).toBeChecked();
    await expect(backgroundImageToggle).toHaveAttribute(
      "aria-keyshortcuts",
      "Shift+I"
    );
    await backgroundImageToggle.uncheck();

    await expect(html).toHaveAttribute("data-background-image", "hidden");
    await expect(body).not.toHaveCSS("background-image", /url\(/);
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("annotouch-background-image"))
      )
      .toBe("false");

    await page.reload();
    await expect(html).toHaveAttribute("data-background-image", "hidden");

    await page.keyboard.press("Shift+i");

    await expect(html).toHaveAttribute("data-background-image", "visible");
    await expect(body).toHaveCSS("background-image", /url\(/);
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("annotouch-background-image"))
      )
      .toBe("true");
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
    await expect(page.getByLabel("show undo/redo")).not.toBeChecked();
    await expect(page.getByLabel("show background image")).toBeChecked();
    await expect(settingsPanel.locator(".keyboard-shortcuts")).toHaveCount(0);
    await expect(
      settingsPanel.getByRole("button", {
        name: "view keyboard shortcuts",
      })
    ).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(settingsPanel).toBeHidden();
    await expect(settingsButton).toHaveAttribute("aria-expanded", "false");

    await settingsButton.click();
    await expect(settingsPanel).toBeVisible();

    await page.mouse.click(20, 120);

    await expect(settingsPanel).toBeHidden();
    await expect(settingsButton).toHaveAttribute("aria-expanded", "false");
  });

  test("gives every control a visible focus ring", async ({ page }) => {
    const controls = [
      "#width-button",
      "#settings-button",
      ".color-swatch",
      "#commands-shortcuts-button",
    ];

    await page.getByRole("button", { name: "settings" }).click();

    for (const selector of controls) {
      const control = page.locator(selector).first();

      // Establish keyboard modality so programmatic focus matches
      // :focus-visible, then focus the control directly.
      await page.keyboard.press("Tab");
      await control.evaluate((element) => element.focus());

      await expect(control).toHaveCSS("outline-style", "solid");
      await expect(control).toHaveCSS("outline-width", "3px");
      await expect(control).toHaveCSS("outline-color", "rgb(29, 78, 216)");
    }

    const fileInput = page.locator("#pdf-input");
    const fileControl = page.locator(".file-control");
    await page.keyboard.press("Tab");
    await fileInput.focus();
    await expect(fileControl).toHaveCSS("outline-style", "solid");
    await expect(fileControl).toHaveCSS("outline-width", "3px");
    await expect(fileControl).toHaveCSS("outline-color", "rgb(29, 78, 216)");
  });

  test("uses one readable size for toolbar text controls", async ({ page }) => {
    for (const selector of [
      "#width-button",
      "#zoom-out-button",
      "#zoom-in-button",
      "#export-button",
    ]) {
      await expect(page.locator(selector)).toHaveCSS("font-size", "14px");
    }
  });

  test("walks the empty toolbar in visual order with Tab", async ({ page }) => {
    await page.evaluate(() => document.activeElement?.blur());

    expect(await walkTabOrder(page, 10)).toEqual([
      "#theme-toggle",
      "#pdf-input",
      ...PEN_COLORS.map((color) => `button[${color.label} pen]`),
      "#width-button",
      "#settings-button",
      "body",
    ]);
  });

  test("walks every enabled toolbar control in visual order with Tab", async ({
    page,
  }, testInfo) => {
    await page.evaluate(() => {
      localStorage.setItem(
        "annotouch-toolbar-settings",
        JSON.stringify({ showHistoryControls: true })
      );
    });
    await page.reload();

    const fixturePath = await createPdfFixture(testInfo, 2);
    await uploadPdf(page, fixturePath, 2);

    // Undo and redo are only reachable once both directions are available;
    // disabled controls are correctly skipped by the browser.
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await drawStroke(page, annotationCanvas, PEN_COLORS[2].y);
    await page.keyboard.press("Control+z");
    await expect(page.locator("#undo-button")).toBeEnabled();
    await expect(page.locator("#redo-button")).toBeEnabled();

    await page.evaluate(() => document.activeElement?.blur());

    expect(await walkTabOrder(page, 15)).toEqual([
      "#theme-toggle",
      "#pdf-input",
      ...PEN_COLORS.map((color) => `button[${color.label} pen]`),
      "#width-button",
      "#undo-button",
      "#redo-button",
      "#zoom-out-button",
      "#zoom-in-button",
      "#export-button",
      // The workspace scrolls, so the browser makes it focusable for
      // keyboard scrolling.
      "section[pdf annotation workspace]",
      "#settings-button",
    ]);
  });

  test("reaches every settings control with Tab while the panel is open", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "settings" }).click();
    await page.evaluate(() => document.activeElement?.blur());

    expect(await walkTabOrder(page, 4)).toEqual([
      "#show-history-controls",
      "#show-background-image",
      "#commands-shortcuts-button",
      "body",
    ]);
  });

  test("traps focus inside the shortcuts viewer", async ({ page }) => {
    await page.getByRole("button", { name: "settings" }).click();
    await page.getByRole("button", { name: "view keyboard shortcuts" }).click();
    await expect(
      page.getByRole("dialog", { name: "keyboard shortcuts" })
    ).toBeVisible();

    // The close button is the viewer's only focusable control, so a trapped
    // focus ring can never leave it in either direction.
    expect(await walkTabOrder(page, 4)).toEqual(
      Array(4).fill("#commands-shortcuts-close")
    );

    const backwards = [];
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press("Shift+Tab");
      backwards.push(await describeFocusedElement(page));
    }
    expect(backwards).toEqual(Array(3).fill("#commands-shortcuts-close"));

    await expect(page.locator("#settings-button")).not.toBeFocused();
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

  test("lists all keyboard shortcuts in their configured groups and order", async ({
    page,
  }) => {
    const settingsButton = page.getByRole("button", { name: "settings" });
    const settingsPanel = page.getByRole("dialog", { name: "settings" });

    await settingsButton.click();

    const viewerButton = page.getByRole("button", {
      name: "view keyboard shortcuts",
    });
    await expect(viewerButton).toBeVisible();
    await expect(viewerButton).toHaveAttribute("aria-haspopup", "dialog");
    await expect(viewerButton).toHaveAttribute(
      "aria-controls",
      "commands-shortcuts-dialog"
    );
    await expect(viewerButton).toHaveAttribute("aria-keyshortcuts", "Meta+K");
    await expect(viewerButton).toHaveAttribute(
      "title",
      "view keyboard shortcuts (⌘ k)"
    );

    await viewerButton.click();

    const dialog = page.getByRole("dialog", { name: "keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(settingsPanel).toBeHidden();
    await expect(settingsButton).toHaveAttribute("aria-expanded", "false");

    const groups = await dialog
      .locator(".commands-shortcuts-group")
      .evaluateAll((sections) =>
        sections.map((section) => ({
          label: section.querySelector("h3")?.textContent,
          rows: [...section.querySelectorAll(".commands-shortcuts-row")].map(
            (row) => ({
              command: row.querySelector("dt")?.textContent,
              keys: [...row.querySelectorAll("kbd")].map(
                (key) => key.textContent
              ),
            })
          ),
        }))
      );

    expect(groups).toEqual([
      {
        label: "general",
        rows: [{ command: "view keyboard shortcuts", keys: ["⌘", "k"] }],
      },
      {
        label: "tools",
        rows: [
          { command: "draw", keys: ["space"] },
          { command: "erase", keys: ["e"] },
          { command: "text", keys: ["t"] },
          { command: "highlight text", keys: ["h"] },
          { command: "stroke width", keys: ["w"] },
        ],
      },
      {
        label: "colors",
        rows: [
          { command: "black", keys: ["1"] },
          { command: "red", keys: ["2"] },
          { command: "green", keys: ["3"] },
          { command: "blue", keys: ["4"] },
          { command: "white", keys: ["5"] },
        ],
      },
      {
        label: "appearance",
        rows: [
          { command: "toggle night mode", keys: ["n"] },
          { command: "toggle background image", keys: ["shift", "i"] },
        ],
      },
      {
        label: "history",
        rows: [
          { command: "undo", keys: ["⌘", "z", "ctrl", "z"] },
          {
            command: "redo",
            keys: ["⌘", "shift", "z", "ctrl", "shift", "z"],
          },
        ],
      },
    ]);
    await expect(dialog.locator(".commands-shortcuts-row")).toHaveCount(15);
    await expect(dialog.locator(".commands-shortcuts-row button")).toHaveCount(
      0
    );
  });

  test("opens keyboard shortcuts with command k", async ({ page }) => {
    const settingsButton = page.getByRole("button", { name: "settings" });
    const settingsPanel = page.getByRole("dialog", { name: "settings" });
    const dialog = page.getByRole("dialog", { name: "keyboard shortcuts" });

    await settingsButton.click();
    await expect(settingsPanel).toBeVisible();
    await page.keyboard.press("Meta+k");

    await expect(dialog).toBeVisible();
    await expect(settingsPanel).toBeHidden();
    await expect(settingsButton).toHaveAttribute("aria-expanded", "false");
  });

  test("closes the shortcuts viewer by button, Escape, and backdrop and restores settings focus", async ({
    page,
  }) => {
    const settingsButton = page.getByRole("button", { name: "settings" });
    const dialog = page.getByRole("dialog", { name: "keyboard shortcuts" });
    const closeButton = page.getByRole("button", {
      name: "close keyboard shortcuts",
    });

    const openViewer = async () => {
      await settingsButton.click();
      await page
        .getByRole("button", { name: "view keyboard shortcuts" })
        .click();
      await expect(dialog).toBeVisible();
    };

    await openViewer();
    await expect(closeButton).toBeFocused();
    await closeButton.click();
    await expect(dialog).toBeHidden();
    await expect(settingsButton).toBeFocused();

    await openViewer();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(settingsButton).toBeFocused();

    await openViewer();
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    await page.mouse.click(dialogBox.x - 5, dialogBox.y + 5);
    await expect(dialog).toBeHidden();
    await expect(settingsButton).toBeFocused();
  });

  test("keeps the light toolbar legible over a dark PDF page", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 540, height: 720 });

    const fixturePath = await createPdfFixture(testInfo, 1, {
      fileName: "dark-page.pdf",
      pageColor: rgb(0, 0, 0),
    });

    await uploadPdf(page, fixturePath, 1);

    const toolbar = page.locator(".toolbar");
    const titleBox = await page.locator("#document-name").boundingBox();
    const pageBox = await shellByPageNumber(page, 1).boundingBox();

    expect(titleBox).not.toBeNull();
    expect(pageBox).not.toBeNull();
    expect(titleBox.x + titleBox.width / 2).toBeGreaterThan(pageBox.x);
    expect(titleBox.x + titleBox.width / 2).toBeLessThan(
      pageBox.x + pageBox.width
    );
    expect(titleBox.y + titleBox.height / 2).toBeGreaterThan(pageBox.y);
    expect(titleBox.y + titleBox.height / 2).toBeLessThan(
      pageBox.y + pageBox.height
    );
    await expect(toolbar).toHaveCSS(
      "background-color",
      "rgba(255, 255, 255, 0.74)"
    );
    await expect(page.locator("#document-name")).toHaveCSS(
      "color",
      "rgb(23, 25, 35)"
    );
  });

  test("uses lowercase borderless shortcuts and a dedicated night palette", async ({
    page,
  }) => {
    await page.evaluate(() => {
      localStorage.setItem("annotouch-theme", "night");
    });
    await page.reload();
    await page.getByRole("button", { name: "settings" }).click();

    const viewerButton = page.getByRole("button", {
      name: "view keyboard shortcuts",
    });
    await expect(viewerButton).toHaveCSS("border-top-style", "none");
    await viewerButton.click();

    const dialog = page.getByRole("dialog", { name: "keyboard shortcuts" });
    const shortcutKeys = dialog.locator("kbd");

    await expect(dialog).toHaveCSS("background-color", "rgb(23, 25, 35)");
    await expect(dialog).toHaveCSS("color", "rgb(243, 244, 246)");
    await expect(shortcutKeys).toHaveCount(25);
    await expect(shortcutKeys.first()).toHaveCSS("border-top-style", "none");
    await expect(shortcutKeys.first()).toHaveCSS("color", "rgb(170, 178, 192)");
    await expect(
      page.getByRole("button", { name: "close keyboard shortcuts" })
    ).toHaveCSS("border-top-style", "none");

    const displayedText = await dialog
      .locator(".commands-shortcuts-content")
      .innerText();
    expect(displayedText).toBe(displayedText.toLowerCase());
  });

  test("uses faint shortcut viewer scrollbars in both themes", async ({
    page,
  }) => {
    const openViewer = async () => {
      await page.getByRole("button", { name: "settings" }).click();
      await page
        .getByRole("button", { name: "view keyboard shortcuts" })
        .click();
    };

    await page.evaluate(() => {
      localStorage.setItem("annotouch-theme", "light");
    });
    await page.reload();
    await openViewer();

    const content = page.locator(".commands-shortcuts-content");
    await expect(content).toHaveCSS(
      "scrollbar-color",
      "rgba(104, 115, 134, 0.18) rgba(0, 0, 0, 0)"
    );

    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      localStorage.setItem("annotouch-theme", "night");
    });
    await page.reload();
    await openViewer();

    await expect(page.locator(".commands-shortcuts-content")).toHaveCSS(
      "scrollbar-color",
      "rgba(170, 178, 192, 0.16) rgba(0, 0, 0, 0)"
    );
  });

  test("suppresses application shortcuts while the viewer is open", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);
    await uploadPdf(page, fixturePath, 1);

    const annotationCanvas = page.locator(".annotation-canvas").first();
    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "red pen" })
    );
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 1 annotation"
    );

    await page.getByRole("button", { name: "settings" }).click();
    await page.getByRole("button", { name: "view keyboard shortcuts" }).click();

    const selectedColor = page.getByRole("button", { name: "red pen" });
    const initialTheme = await page.locator("html").getAttribute("data-theme");
    const initialBackgroundImage = await page
      .locator("html")
      .getAttribute("data-background-image");
    await page.keyboard.press("5");
    await page.keyboard.press("n");
    await page.keyboard.press("Shift+i");
    await page.keyboard.press("Control+Z");
    await page.keyboard.press("Control+Shift+Z");
    await page.keyboard.press("Space");
    await page.keyboard.press("e");

    await expect(selectedColor).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      initialTheme
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-background-image",
      initialBackgroundImage
    );
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 1 annotation"
    );
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expect(page.getByRole("status")).toHaveText("ready");
  });

  test("keeps the shortcuts viewer contained and scrollable at narrow sizes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 360 });
    await page.getByRole("button", { name: "settings" }).click();
    await page.getByRole("button", { name: "view keyboard shortcuts" }).click();

    const dialog = page.getByRole("dialog", { name: "keyboard shortcuts" });
    const content = dialog.locator(".commands-shortcuts-content");
    const dialogBox = await dialog.boundingBox();

    expect(dialogBox).not.toBeNull();
    expect(dialogBox.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(320);
    expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(360);
    await expect(content).toHaveCSS("overflow-y", "auto");
    expect(
      await content.evaluate(
        (element) => element.scrollHeight > element.clientHeight
      )
    ).toBe(true);

    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(dialog.getByText("redo", { exact: true })).toBeVisible();
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
    const widerSummaryBox = await page
      .locator("#document-summary")
      .boundingBox();

    expect(widerToolbarBox).not.toBeNull();
    expect(widerSummaryBox).not.toBeNull();
    expect(widerToolbarBox.height).toBeLessThanOrEqual(64);
    expect(widerSummaryBox.width).toBeGreaterThanOrEqual(150);
    expect(widerSummaryBox.width).toBeLessThanOrEqual(180);
    await expect(page.locator("#document-name")).toHaveCSS("font-size", "13px");
    await expect(page.locator("#document-count")).toBeVisible();
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 0 annotations"
    );
  });

  test("zooms without changing render backing size", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 720, height: 600 });
    await expect(page.locator(".zoom-controls")).toBeHidden();

    await page.setViewportSize({ width: 800, height: 600 });

    const fixturePath = await createPdfFixture(testInfo, 1);

    await expect(page.getByRole("button", { name: "zoom out" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "zoom in" })).toBeDisabled();

    await uploadPdf(page, fixturePath, 1);

    const pageShell = page.locator(".page-shell").first();
    const annotationCanvas = page.locator(".annotation-canvas").first();
    const initialShellBox = await pageShell.boundingBox();
    const initialBackingSize = await getCanvasBackingSize(annotationCanvas);

    expect(initialShellBox).not.toBeNull();
    await expect(page.getByRole("button", { name: "zoom out" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "zoom in" })).toBeEnabled();

    const zoomControlsBox = await page.locator(".zoom-controls").boundingBox();
    const widthButtonBox = await page.locator("#width-button").boundingBox();

    expect(zoomControlsBox).not.toBeNull();
    expect(widthButtonBox).not.toBeNull();
    expect(zoomControlsBox.width).toBeLessThan(widthButtonBox.width);

    for (const name of ["zoom out", "zoom in"]) {
      const buttonBox = await page.getByRole("button", { name }).boundingBox();

      expect(buttonBox).not.toBeNull();
      expect(buttonBox.width).toBeGreaterThanOrEqual(24);
      expect(buttonBox.x).toBeGreaterThanOrEqual(zoomControlsBox.x - 1);
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
        zoomControlsBox.x + zoomControlsBox.width + 1
      );
    }

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "zoom out" })
    );

    const zoomedShellBox = await pageShell.boundingBox();

    expect(zoomedShellBox).not.toBeNull();
    expect(zoomedShellBox.width).toBeLessThan(initialShellBox.width);
    expect(await getCanvasBackingSize(annotationCanvas)).toEqual(
      initialBackingSize
    );

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "red pen" })
    );
    await drawStrokeAtCanvasCoordinates(page, annotationCanvas, {
      startX: 110,
      endX: 360,
      y: PEN_COLORS[1].y,
    });
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clickToolbarControl(page, page.getByRole("button", { name: "export" })),
    ]);

    const exportedPath = testInfo.outputPath(
      "fixture-1-page-zoomed-annotated.pdf"
    );
    await download.saveAs(exportedPath);

    page.once("dialog", (dialog) => dialog.accept());
    await uploadPdf(page, exportedPath, 1);
    await expectCanvasHasColor(
      page.locator(".pdf-canvas").first(),
      PEN_COLORS[1]
    );
  });

  test("warns only while annotations have unsaved content", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    expect(await reloadAndCollectDialogs(page)).toEqual([]);

    await uploadPdf(page, fixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);

    const refreshDialogs = await reloadAndCollectDialogs(page, {
      accept: false,
    });
    expect(refreshDialogs).toEqual([{ type: "beforeunload", message: "" }]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 1 annotation"
    );
    await page.close();
  });

  test("does not warn when undo returns the stroke count to zero", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await page.keyboard.press("Control+Z");
    await expectCanvasToBeEmpty(annotationCanvas);
    expect(await reloadAndCollectDialogs(page)).toEqual([]);
  });

  test("successful export keeps the warning active", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);

    await Promise.all([
      page.waitForEvent("download"),
      clickToolbarControl(page, page.getByRole("button", { name: "export" })),
    ]);
    await expect(page.getByRole("status")).toHaveText("exported");

    expect(await reloadAndCollectDialogs(page, { accept: false })).toEqual([
      { type: "beforeunload", message: "" },
    ]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await page.close();
  });

  test("failed export leaves annotations unsaved", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await page.evaluate(() => {
      URL.createObjectURL = () => {
        throw new Error("forced export failure");
      };
    });

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "export" })
    );
    await expect(page.getByRole("status")).toHaveText("export failed");
    errorsByPage.get(page).consoleErrors.length = 0;

    expect(await reloadAndCollectDialogs(page, { accept: false })).toEqual([
      { type: "beforeunload", message: "" },
    ]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await page.close();
  });

  test("keeps unsaved work when picker replacement is canceled and replaces it when confirmed", async ({
    page,
  }, testInfo) => {
    const firstFixturePath = await createNamedPdfFixture(testInfo, "first.pdf");
    const secondFixturePath = await createNamedPdfFixture(
      testInfo,
      "second.pdf"
    );

    await uploadPdf(page, firstFixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);

    const canceledDialogPromise = page.waitForEvent("dialog");
    const canceledReplacement = page
      .locator("#pdf-input")
      .setInputFiles(secondFixturePath);
    const canceledDialog = await canceledDialogPromise;
    expect(canceledDialog.type()).toBe("confirm");
    expect(canceledDialog.message()).toBe(
      "discard unsaved annotations and open another PDF?"
    );
    await canceledDialog.dismiss();
    await canceledReplacement;

    await expect(page.locator("#document-name")).toHaveText("first.pdf");
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);

    await page.locator("#pdf-input").setInputFiles([]);
    const confirmedDialogPromise = page.waitForEvent("dialog");
    const confirmedReplacement = page
      .locator("#pdf-input")
      .setInputFiles(secondFixturePath);
    const confirmedDialog = await confirmedDialogPromise;
    expect(confirmedDialog.message()).toBe(
      "discard unsaved annotations and open another PDF?"
    );
    await confirmedDialog.accept();
    await confirmedReplacement;
    await expectPdfReady(page, 1);

    await expect(page.locator("#document-name")).toHaveText("second.pdf");
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 0 annotations"
    );
  });

  test("uses the same discard confirmation for PDF drops", async ({
    page,
  }, testInfo) => {
    const firstFixturePath = await createNamedPdfFixture(
      testInfo,
      "drop-first.pdf"
    );
    const secondFixturePath = await createNamedPdfFixture(
      testInfo,
      "drop-second.pdf"
    );

    await uploadPdf(page, firstFixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);

    const canceledDialogPromise = page.waitForEvent("dialog");
    const canceledDrop = dropPdf(page, secondFixturePath);
    const canceledDialog = await canceledDialogPromise;
    expect(canceledDialog.message()).toBe(
      "discard unsaved annotations and open another PDF?"
    );
    await canceledDialog.dismiss();
    await canceledDrop;

    await expect(page.locator("#document-name")).toHaveText("drop-first.pdf");
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);

    const confirmedDialogPromise = page.waitForEvent("dialog");
    const confirmedDrop = dropPdf(page, secondFixturePath);
    const confirmedDialog = await confirmedDialogPromise;
    await confirmedDialog.accept();
    await confirmedDrop;
    await expectPdfReady(page, 1);

    await expect(page.locator("#document-name")).toHaveText("drop-second.pdf");
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 0 annotations"
    );
  });

  test("replaces a PDF that is still preparing pages", async ({
    page,
  }, testInfo) => {
    const slowFixturePath = await createPdfFixture(testInfo, 205);
    const replacementPath = await createNamedPdfFixture(
      testInfo,
      "replacement.pdf"
    );

    // Throttle the CPU so page preparation is still running when the
    // replacement arrives.
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 20 });

    const slowUpload = page
      .locator("#pdf-input")
      .setInputFiles(slowFixturePath);
    await expect(page.locator("#status")).toContainText("preparing page");

    await dropPdf(page, replacementPath);
    await slowUpload;
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await session.detach();
    await expectPdfReady(page, 1);

    await expect(page.locator("#document-name")).toHaveText("replacement.pdf");
    await expect(page.locator(".page-shell")).toHaveCount(1);
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 0 annotations"
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clickToolbarControl(page, page.getByRole("button", { name: "export" })),
    ]);

    expect(download.suggestedFilename()).toBe("replacement-annotated.pdf");

    const exportedPath = testInfo.outputPath("replacement-annotated.pdf");
    await download.saveAs(exportedPath);
    await expectPdfPageCount(exportedPath, 1);
  });

  test("exports the annotated document when a replacement drops mid-export", async ({
    page,
  }, testInfo) => {
    const originalPath = await createNamedPdfFixture(testInfo, "original.pdf");
    const replacementPath = await createNamedPdfFixture(
      testInfo,
      "replacement.pdf"
    );

    await uploadPdf(page, originalPath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await placeText(page, annotationCanvas, {
      x: 120,
      y: PEN_COLORS[1].y,
      text: "raced export",
    });

    // Hold the lazily imported exporter so the replacement lands inside the
    // export's await window, where `close()` resets the annotation store and
    // clears `pageViewports` in place.
    let releaseExporter;
    const exporterReleased = new Promise((resolve) => {
      releaseExporter = resolve;
    });
    let markExporterRequested;
    const exporterRequested = new Promise((resolve) => {
      markExporterRequested = resolve;
    });

    await page.route(
      (url) => url.pathname.includes("exporter"),
      async (route) => {
        markExporterRequested();
        await exporterReleased;
        await route.continue();
      }
    );

    const downloadPromise = page.waitForEvent("download");
    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "export" })
    );
    await exporterRequested;

    // The picker is disabled while busy, so a drop is the only way in — which
    // is exactly the path that races the export.
    const dialogPromise = page.waitForEvent("dialog");
    const drop = dropPdf(page, replacementPath);
    await (await dialogPromise).accept();
    await drop;
    await expectPdfReady(page, 1);

    // The replacement is fully open and the store is empty before the export
    // is allowed to read anything.
    await expect(page.locator("#document-name")).toHaveText("replacement.pdf");
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 0 annotations"
    );

    releaseExporter();

    // The export still belongs to the document that was open when it started.
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("original-annotated.pdf");

    const exportedPath = testInfo.outputPath("original-annotated.pdf");
    await download.saveAs(exportedPath);
    await expectPdfContainsText(exportedPath, ["raced export"]);
  });

  for (const { label, fileName, bytes } of UNLOADABLE_PDF_FIXTURES) {
    test(`refuses ${label} and keeps the workspace empty`, async ({
      page,
    }, testInfo) => {
      const fixturePath = await writeRawFixture(testInfo, fileName, bytes());

      await page.locator("#pdf-input").setInputFiles(fixturePath);

      await expect(page.locator("#status")).toHaveText("could not load PDF");
      await expect(page.locator(".page-shell")).toHaveCount(0);
      await expect(page.locator("#empty-state")).toBeVisible();
      await expect(page.locator("#document-summary")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "export" })).toBeDisabled();

      // PDF.js reports the rejection through console.error on purpose.
      errorsByPage.get(page).consoleErrors.length = 0;
    });

    test(`discards the open document when ${label} fails to load`, async ({
      page,
    }, testInfo) => {
      const goodFixturePath = await createPdfFixture(testInfo, 3);
      const badFixturePath = await writeRawFixture(testInfo, fileName, bytes());

      await uploadPdf(page, goodFixturePath, 3);
      await expect(page.locator(".page-shell")).toHaveCount(3);

      await page.locator("#pdf-input").setInputFiles(badFixturePath);

      await expect(page.locator("#status")).toHaveText("could not load PDF");
      await expect(page.locator(".page-shell")).toHaveCount(0);
      await expect(page.locator("#empty-state")).toBeVisible();
      await expect(page.getByRole("button", { name: "export" })).toBeDisabled();

      // The discarded document must not leave a stale unload guard behind.
      expect(await reloadAndCollectDialogs(page)).toEqual([]);

      errorsByPage.get(page).consoleErrors.length = 0;
    });
  }

  test("recovers and loads a valid PDF after a failed load", async ({
    page,
  }, testInfo) => {
    const badFixturePath = await writeRawFixture(
      testInfo,
      "malformed.pdf",
      Buffer.from("this is definitely not a pdf")
    );
    const goodFixturePath = await createPdfFixture(testInfo, 2);

    await page.locator("#pdf-input").setInputFiles(badFixturePath);
    await expect(page.locator("#status")).toHaveText("could not load PDF");
    errorsByPage.get(page).consoleErrors.length = 0;

    await uploadPdf(page, goodFixturePath, 2);

    await expect(page.locator(".page-shell")).toHaveCount(2);
    await expect(page.locator("#document-count")).toHaveText(
      "2/2 pages | 0 annotations"
    );
    await expect(page.getByRole("button", { name: "export" })).toBeEnabled();
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
        clickToolbarControl(page, page.getByRole("button", { name: "export" })),
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

    await expect(page.locator(".page-shell")).toHaveCount(
      MAX_ANNOTATABLE_PAGES
    );
    await expect(
      page.locator(".page-shell[data-page-number='200']")
    ).toHaveCount(1);
    await expect(
      page.locator(".page-shell[data-page-number='201']")
    ).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clickToolbarControl(page, page.getByRole("button", { name: "export" })),
    ]);

    expect(download.suggestedFilename()).toBe("fixture-205-page-annotated.pdf");

    const exportedPath = testInfo.outputPath("fixture-205-page-annotated.pdf");
    await download.saveAs(exportedPath);
    await expectPdfPageCount(exportedPath, 205);
  });

  test("renders only pages near the viewport while scrolling a large document", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 205);

    await uploadPdf(page, fixturePath, 205);

    const shells = page.locator(".page-shell");
    const renderedShells = page.locator(
      ".page-shell[data-render-state='rendered']"
    );
    const workspace = page.locator(".workspace");

    await expect(shells).toHaveCount(MAX_ANNOTATABLE_PAGES);

    // Observed: 3 of 200 rendered at rest.
    expect(await renderedShells.count()).toBeLessThanOrEqual(
      NEARBY_RENDERED_PAGE_LIMIT
    );

    const shellHeight = await shells
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);

    await workspace.evaluate((element, scrollTop) => {
      element.scrollTop = scrollTop;
    }, shellHeight * 49);

    await expect(shellByPageNumber(page, 50)).toHaveAttribute(
      "data-render-state",
      "rendered"
    );

    // Page 50 was reached by jumping straight past pages 4-45, and nothing
    // beyond the root margin was touched on the way.
    await expect(shellByPageNumber(page, 150)).toHaveAttribute(
      "data-render-state",
      "pending"
    );
    await expect(shellByPageNumber(page, 200)).toHaveAttribute(
      "data-render-state",
      "pending"
    );

    await workspace.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    await expect(
      shellByPageNumber(page, MAX_ANNOTATABLE_PAGES)
    ).toHaveAttribute("data-render-state", "rendered");

    // Observed: 10 of 200 after visiting the top, the middle, and the end.
    expect(await renderedShells.count()).toBeLessThanOrEqual(
      SCROLLED_RENDERED_PAGE_LIMIT
    );
    await expect(
      page.locator(".page-shell[data-render-state='rendering']")
    ).toHaveCount(0);
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

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "red pen" })
    );
    await drawStroke(page, page30Canvas, PEN_COLORS[1].y);
    await expectCanvasHasColor(page30Canvas, PEN_COLORS[1]);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clickToolbarControl(page, page.getByRole("button", { name: "export" })),
    ]);

    expect(download.suggestedFilename()).toBe("fixture-30-page-annotated.pdf");

    const exportedPath = testInfo.outputPath("fixture-30-page-annotated.pdf");
    await download.saveAs(exportedPath);
    await expectPdfPageCount(exportedPath, 30);

    page.once("dialog", (dialog) => dialog.accept());
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

    await settingsButton.click();
    await showHistoryControls.check();
    await page.keyboard.press("Escape");

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "red pen" })
    );
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await expect(historyControls).toBeVisible();
    await expect(page.getByRole("button", { name: "undo" })).toBeEnabled();

    await settingsButton.click();
    await expect(settingsPanel).toBeVisible();
    await showHistoryControls.uncheck();

    await expect(historyControls).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(settingsPanel).toBeHidden();

    await page.keyboard.press("Control+Z");
    await expectCanvasToBeEmpty(annotationCanvas);

    await page.keyboard.press("Control+Shift+Z");
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);

    expect(await reloadAndCollectDialogs(page)).toEqual([
      { type: "beforeunload", message: "" },
    ]);

    await expect(page.locator(".history-controls")).toBeHidden();

    await page.getByRole("button", { name: "settings" }).click();
    await expect(page.getByLabel("show undo/redo")).not.toBeChecked();
  });

  test("draws colors, preserves prior strokes, supports undo, redo, and exports colored PDF", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    await page.getByRole("button", { name: "settings" }).click();
    await page.getByLabel("show undo/redo").check();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "undo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "redo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "export" })).toBeEnabled();

    const annotationCanvas = page.locator(".annotation-canvas").first();

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "red pen" })
    );
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await expect(page.getByRole("button", { name: "undo" })).toBeEnabled();
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "green pen" })
    );
    await drawStroke(page, annotationCanvas, PEN_COLORS[2].y);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await clickToolbarControl(page, page.getByRole("button", { name: "undo" }));
    await expect(page.getByRole("button", { name: "redo" })).toBeEnabled();
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[2]);

    await clickToolbarControl(page, page.getByRole("button", { name: "redo" }));
    await expect(page.getByRole("button", { name: "redo" })).toBeDisabled();
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await page.keyboard.press("Control+Z");
    await expect(page.getByRole("button", { name: "redo" })).toBeEnabled();
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[2]);

    await page.keyboard.press("Control+Shift+Z");
    await expect(page.getByRole("button", { name: "redo" })).toBeDisabled();
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await clickToolbarControl(page, page.getByRole("button", { name: "undo" }));
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[2]);

    for (const color of [
      PEN_COLORS[2],
      PEN_COLORS[0],
      PEN_COLORS[3],
      PEN_COLORS[4],
    ]) {
      await clickToolbarControl(
        page,
        page.getByRole("button", { name: `${color.label} pen` })
      );
      await drawStroke(page, annotationCanvas, color.y);
      await expect(page.getByRole("button", { name: "redo" })).toBeDisabled();
      await expectCanvasHasColor(annotationCanvas, color);
    }

    for (const color of PEN_COLORS) {
      await expectCanvasHasColor(annotationCanvas, color);
    }

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clickToolbarControl(page, page.getByRole("button", { name: "export" })),
    ]);

    expect(download.suggestedFilename()).toBe("fixture-1-page-annotated.pdf");

    const exportedPath = testInfo.outputPath("fixture-1-page-annotated.pdf");
    await download.saveAs(exportedPath);
    await expectPdfPageCount(exportedPath, 1);

    page.once("dialog", (dialog) => dialog.accept());
    await uploadPdf(page, exportedPath, 1);
    const pdfCanvas = page.locator(".pdf-canvas").first();

    for (const color of PEN_COLORS) {
      await expectCanvasHasColor(pdfCanvas, color);
    }
  });

  test("selects pen colors with number keys in toolbar order", async ({
    page,
  }) => {
    for (const [index, color] of PEN_COLORS.entries()) {
      const colorButton = page.getByRole("button", {
        name: `${color.label} pen`,
      });

      await expect(colorButton).toHaveAttribute(
        "aria-keyshortcuts",
        String(index + 1)
      );
      await page.keyboard.press(String(index + 1));
      await expect(colorButton).toHaveAttribute("aria-pressed", "true");
    }

    await page.locator("#pdf-input").focus();
    await page.keyboard.press("1");
    await expect(
      page.getByRole("button", { name: "white pen" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("cycles stroke width with W and lists the shortcut", async ({
    page,
  }) => {
    const widthButton = page.locator("#width-button");

    await expect(widthButton).toHaveAttribute("aria-keyshortcuts", "W");
    await expect(widthButton).toHaveText("small");

    await page.keyboard.press("w");
    await expect(widthButton).toHaveText("med");
    await page.keyboard.press("W");
    await expect(widthButton).toHaveText("large");
    await page.keyboard.press("w");
    await expect(widthButton).toHaveText("small");

    await page.locator("#pdf-input").focus();
    await page.keyboard.press("w");
    await expect(widthButton).toHaveText("small");

    await page.getByRole("button", { name: "settings" }).click();
    await page.getByRole("button", { name: "view keyboard shortcuts" }).click();
    const shortcuts = page.getByRole("dialog", {
      name: "keyboard shortcuts",
    });

    await expect(
      shortcuts.locator("dt", { hasText: "stroke width" })
    ).toBeVisible();
    await expect(shortcuts.locator("kbd", { hasText: "W" })).toBeVisible();
  });

  test("places and edits keyboard-only multiline text with unified history", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await expect(page.getByRole("button", { name: "add text" })).toHaveCount(0);
    await page.keyboard.press("Meta+k");
    const shortcutsDialog = page.getByRole("dialog", {
      name: "keyboard shortcuts",
    });
    await expect(
      shortcutsDialog.locator("dt", { hasText: /^text$/ })
    ).toBeVisible();
    await expect(
      shortcutsDialog.locator("kbd", { hasText: /^t$/ })
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await uploadPdf(page, fixturePath, 1);

    const annotationCanvas = page.locator(".annotation-canvas").first();

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "red pen" })
    );
    await page.keyboard.press("t");
    await expect(page.getByRole("status")).toHaveText(
      "click a page to add text"
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("status")).toHaveText("ready");
    await page.keyboard.press("t");
    await expect(page.getByRole("status")).toHaveText(
      "click a page to add text"
    );
    await expect(annotationCanvas).toHaveCSS("cursor", "text");

    await clickCanvasAt(page, annotationCanvas, { x: 120, y: 180 });
    const editor = page.getByRole("textbox", {
      name: "new text annotation",
    });

    await expect(editor).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("adding text");
    await editor.fill("First line\nSecond line");
    const editorBox = await editor.boundingBox();
    expect(editorBox.height).toBeGreaterThan(40);

    await page.keyboard.press("Control+Enter");

    await expect(editor).toBeHidden();
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 1 annotation"
    );
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "green pen" })
    );
    await doubleClickCanvasAt(page, annotationCanvas, { x: 140, y: 190 });

    const editBox = page.getByRole("textbox", {
      name: "edit text annotation",
    });
    await expect(editBox).toHaveValue("First line\nSecond line");
    await editBox.fill("Edited line\nStill multiline");
    await page.keyboard.press("Escape");

    await expect(editBox).toBeHidden();
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 1 annotation"
    );
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[2]);

    await page.keyboard.press("Control+Z");
    await doubleClickCanvasAt(page, annotationCanvas, { x: 140, y: 190 });
    await expect(
      page.getByRole("textbox", { name: "edit text annotation" })
    ).toHaveValue("First line\nSecond line");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+Shift+Z");
    await doubleClickCanvasAt(page, annotationCanvas, { x: 140, y: 190 });
    await expect(
      page.getByRole("textbox", { name: "edit text annotation" })
    ).toHaveValue("Edited line\nStill multiline");
    await page.keyboard.press("Escape");
  });

  test("discards blank text and deletes text by blank edit or eraser", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();

    await page.keyboard.press("t");
    await clickCanvasAt(page, annotationCanvas, { x: 120, y: 180 });
    await page.getByRole("textbox", { name: "new text annotation" }).fill("  ");
    await page.keyboard.press("Escape");
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 0 annotations"
    );

    await placeText(page, annotationCanvas, {
      x: 120,
      y: 180,
      text: "Delete me",
    });
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 1 annotation"
    );

    await doubleClickCanvasAt(page, annotationCanvas, { x: 140, y: 190 });
    await page.getByRole("textbox", { name: "edit text annotation" }).fill("");
    await page.keyboard.press("Escape");
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 0 annotations"
    );

    await page.keyboard.press("Control+Z");
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 1 annotation"
    );

    await moveCanvasPointerTo(page, annotationCanvas, { x: 140, y: 190 });
    await page.keyboard.down("e");
    await expect(page.getByRole("status")).toHaveText("erasing");
    await page.keyboard.up("e");
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 0 annotations"
    );
    await expectCanvasToBeEmpty(annotationCanvas);
  });

  test("warns before unloading an in-progress text draft", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await page.keyboard.press("t");
    await clickCanvasAt(page, annotationCanvas, { x: 120, y: 180 });
    await page
      .getByRole("textbox", { name: "new text annotation" })
      .fill("Unsaved draft");

    expect(await reloadAndCollectDialogs(page)).toEqual([
      { type: "beforeunload", message: "" },
    ]);
  });

  test("exports multiline text as extractable vector PDF content", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "red pen" })
    );
    await placeText(page, annotationCanvas, {
      x: 120,
      y: PEN_COLORS[1].y,
      text: "Vector café\nVector second",
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clickToolbarControl(page, page.getByRole("button", { name: "export" })),
    ]);
    const exportedPath = testInfo.outputPath("text-annotated.pdf");
    await download.saveAs(exportedPath);

    await expectPdfContainsText(exportedPath, ["Vector café", "Vector second"]);
    await expectPdfPageCount(exportedPath, 1);

    page.once("dialog", (dialog) => dialog.accept());
    await uploadPdf(page, exportedPath, 1);
    await expectCanvasHasColor(
      page.locator(".pdf-canvas").first(),
      PEN_COLORS[1]
    );
  });

  test("highlights selected PDF text with H, undo, redo, erase, and export", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    // "Annotouch QA fixture" sits at x 54, baseline y 81 in canvas pixels.
    const band = { x: 60, y: 60, width: 150, height: 24 };

    await page.keyboard.press("h");
    await expect(page.getByRole("status")).toHaveText(
      "drag across text to highlight"
    );
    await expect(page.locator("#app")).toHaveClass(/is-highlight-mode/);

    await dragCanvas(
      page,
      annotationCanvas,
      { x: 56, y: 74 },
      { x: 200, y: 74 }
    );
    expect(await getCanvasCoverage(annotationCanvas, band)).toBeGreaterThan(
      0.5
    );

    await page.keyboard.press("ControlOrMeta+z");
    expect(await getCanvasCoverage(annotationCanvas, band)).toBe(0);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    expect(await getCanvasCoverage(annotationCanvas, band)).toBeGreaterThan(
      0.5
    );

    await page.keyboard.press("h");
    await expect(page.getByRole("status")).toHaveText("ready");
    await expect(page.locator("#app")).not.toHaveClass(/is-highlight-mode/);

    await moveCanvasPointerTo(page, annotationCanvas, { x: 120, y: 74 });
    await page.keyboard.down("e");
    await page.keyboard.up("e");
    expect(await getCanvasCoverage(annotationCanvas, band)).toBe(0);
    await page.keyboard.press("ControlOrMeta+z");
    expect(await getCanvasCoverage(annotationCanvas, band)).toBeGreaterThan(
      0.5
    );

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clickToolbarControl(page, page.getByRole("button", { name: "export" })),
    ]);
    const exportedPath = testInfo.outputPath("highlight-annotated.pdf");
    await download.saveAs(exportedPath);

    const highlights = await getPdfAnnotations(exportedPath);

    expect(highlights).toHaveLength(1);

    const [highlight] = highlights;
    expect(highlight).toMatchObject({ subtype: "Highlight" });
    expect(highlight.contentsObj.str).toMatch(/^Annotouch/);
    expect(highlight.quadPoints.length).toBeGreaterThan(0);

    // PDF.js paints the exported highlight into the page bitmap.
    page.once("dialog", (dialog) => dialog.accept());
    await uploadPdf(page, exportedPath, 1);
    const tint = await page
      .locator(".pdf-canvas")
      .first()
      .evaluate((element, { x, y, width, height }) => {
        const data = element
          .getContext("2d")
          .getImageData(x, y, width, height).data;
        let yellowest = 0;
        for (let index = 0; index < data.length; index += 4) {
          yellowest = Math.max(yellowest, data[index] - data[index + 2]);
        }
        return yellowest;
      }, band);
    expect(tint).toBeGreaterThan(40);
  });

  test.describe("highlight accuracy", () => {
    test("highlights and exports only the selected word", async ({
      page,
    }, testInfo) => {
      const passage = await createPassageFixture(testInfo);
      await uploadPdf(page, passage.filePath, 1);
      const word = await passage.measure(page);
      const annotationCanvas = page.locator(".annotation-canvas").first();
      const fox = word(0, "fox");

      await page.keyboard.press("h");
      await dragCanvas(page, annotationCanvas, fox.startPoint, fox.endPoint);

      expectBandOverWord(
        await getPaintedBounds(annotationCanvas, "painted"),
        fox
      );
      for (const neighbour of [word(0, "brown"), word(0, "jumps")]) {
        expect(await getCanvasCoverage(annotationCanvas, neighbour.box)).toBe(
          0
        );
      }

      const exportedPath = await exportPdf(page, testInfo, "fox.pdf");
      const highlights = await getPdfAnnotations(exportedPath);
      expect(highlights).toHaveLength(1);
      expect(highlights[0].contentsObj.str).toBe("fox");
      expectQuadsOverWords(highlights[0].quadPoints, [fox]);

      // The exported annotation itself paints over the same word.
      page.once("dialog", (dialog) => dialog.accept());
      await uploadPdf(page, exportedPath, 1);
      expectBandOverWord(
        await getPaintedBounds(page.locator(".pdf-canvas").first(), "yellow"),
        fox
      );
    });

    test("trims the spaces around a word dragged right to left", async ({
      page,
    }, testInfo) => {
      const passage = await createPassageFixture(testInfo);
      await uploadPdf(page, passage.filePath, 1);
      const word = await passage.measure(page);
      const annotationCanvas = page.locator(".annotation-canvas").first();
      const brown = word(0, "brown");
      const fox = word(0, "fox");
      const jumps = word(0, "jumps");
      const midline = fox.startPoint.y;

      // From the middle of the gap after "fox" back to the middle of the gap
      // before it: both spaces are grabbed, and both must be trimmed.
      await page.keyboard.press("h");
      await dragCanvas(
        page,
        annotationCanvas,
        { x: (fox.box.x + fox.box.width + jumps.box.x) / 2, y: midline },
        { x: (brown.box.x + brown.box.width + fox.box.x) / 2, y: midline }
      );

      expectBandOverWord(
        await getPaintedBounds(annotationCanvas, "painted"),
        fox
      );

      const exportedPath = await exportPdf(page, testInfo, "fox-reverse.pdf");
      const highlights = await getPdfAnnotations(exportedPath);
      expect(highlights).toHaveLength(1);
      const [highlight] = highlights;
      expect(highlight.contentsObj.str).toBe("fox");
      expectQuadsOverWords(highlight.quadPoints, [fox]);
    });

    test("highlights and exports exactly a passage that spans lines", async ({
      page,
    }, testInfo) => {
      const passage = await createPassageFixture(testInfo);
      await uploadPdf(page, passage.filePath, 1);
      const word = await passage.measure(page);
      const annotationCanvas = page.locator(".annotation-canvas").first();
      const firstLine = spanWords(word(0, "brown"), word(0, "over"));
      const secondLine = spanWords(word(1, "the"), word(1, "dog"));

      await page.keyboard.press("h");
      await dragCanvas(
        page,
        annotationCanvas,
        word(0, "brown").startPoint,
        word(1, "dog").endPoint
      );

      expectBandOverWord(
        await getPaintedBounds(
          annotationCanvas,
          "painted",
          passage.lineStrip(0)
        ),
        firstLine
      );
      expectBandOverWord(
        await getPaintedBounds(
          annotationCanvas,
          "painted",
          passage.lineStrip(1)
        ),
        secondLine
      );
      for (const unselected of [
        word(0, "quick"),
        word(1, "while"),
        word(2, "highlights"),
      ]) {
        expect(await getCanvasCoverage(annotationCanvas, unselected.box)).toBe(
          0
        );
      }

      const exportedPath = await exportPdf(page, testInfo, "passage.pdf");
      const highlights = await getPdfAnnotations(exportedPath);
      expect(highlights).toHaveLength(1);
      const [highlight] = highlights;
      expect(highlight.contentsObj.str).toBe(
        "brown fox jumps over the lazy dog"
      );
      expectQuadsOverWords(highlight.quadPoints, [firstLine, secondLine]);
    });

    test("exports each highlight with its own text, in order", async ({
      page,
    }, testInfo) => {
      const passage = await createPassageFixture(testInfo);
      await uploadPdf(page, passage.filePath, 1);
      const word = await passage.measure(page);
      const annotationCanvas = page.locator(".annotation-canvas").first();
      const selections = [
        word(2, "passage"),
        word(0, "quick"),
        word(1, "lazy"),
      ];

      await page.keyboard.press("h");
      for (const selection of selections) {
        await dragCanvas(
          page,
          annotationCanvas,
          selection.startPoint,
          selection.endPoint
        );
      }

      // Undo drops only the latest highlight, and redo restores it.
      await page.keyboard.press("ControlOrMeta+z");
      expect(await getCanvasCoverage(annotationCanvas, selections[2].box)).toBe(
        0
      );
      expect(
        await getCanvasCoverage(annotationCanvas, selections[1].box)
      ).toBeGreaterThan(0.5);
      await page.keyboard.press("ControlOrMeta+Shift+z");

      const exportedPath = await exportPdf(page, testInfo, "several.pdf");
      const highlights = await getPdfAnnotations(exportedPath);

      expect(highlights.map((highlight) => highlight.contentsObj.str)).toEqual([
        "passage",
        "quick",
        "lazy",
      ]);
      highlights.forEach((highlight, index) => {
        expectQuadsOverWords(highlight.quadPoints, [selections[index]]);
      });
    });
  });

  for (const rotation of [90, 180, 270]) {
    test(`exports a highlight in place on a ${rotation}-degree page`, async ({
      page,
    }, testInfo) => {
      const fixturePath = await createPdfFixture(testInfo, 1, {
        fileName: `fixture-highlight-rotated-${rotation}.pdf`,
        rotation,
      });
      const { start, end } = await getFirstTextLine(fixturePath);

      // Rotation can put the title near the bottom of the rendered page.
      await page.setViewportSize({ width: 1280, height: 1100 });
      await uploadPdf(page, fixturePath, 1);
      const annotationCanvas = page.locator(".annotation-canvas").first();

      await page.keyboard.press("h");
      await dragCanvas(page, annotationCanvas, start, end);
      await page.keyboard.press("h");
      const sourceBounds = await getPaintedBounds(annotationCanvas, "painted");

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        clickToolbarControl(page, page.getByRole("button", { name: "export" })),
      ]);
      const exportedPath = testInfo.outputPath(
        `highlight-rotated-${rotation}-annotated.pdf`
      );
      await download.saveAs(exportedPath);
      const highlights = await getPdfAnnotations(exportedPath);
      expect(highlights).toHaveLength(1);
      const [highlight] = highlights;
      expect(highlight.contentsObj.str).toBe("Annotouch QA fixture");

      page.once("dialog", (dialog) => dialog.accept());
      await uploadPdf(page, exportedPath, 1);
      const exportedBounds = await getPaintedBounds(
        page.locator(".pdf-canvas").first(),
        "yellow"
      );

      for (const key of ["left", "top", "right", "bottom"]) {
        expect(Math.abs(exportedBounds[key] - sourceBounds[key])).toBeLessThan(
          4
        );
      }
    });
  }

  for (const rotation of [90, 180, 270]) {
    test(`preserves text placement and orientation on a ${rotation}-degree page`, async ({
      page,
    }, testInfo) => {
      const text = `Rotate ${rotation}`;
      const fixturePath = await createPdfFixture(testInfo, 1, {
        fileName: `fixture-rotated-${rotation}.pdf`,
        rotation,
      });

      await uploadPdf(page, fixturePath, 1);
      const annotationCanvas = page.locator(".annotation-canvas").first();
      await clickToolbarControl(
        page,
        page.getByRole("button", { name: "red pen" })
      );
      await placeText(page, annotationCanvas, {
        x: 120,
        y: 180,
        text,
      });
      const sourceBounds = await expectCanvasColorBounds(
        annotationCanvas,
        PEN_COLORS[1]
      );

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        clickToolbarControl(page, page.getByRole("button", { name: "export" })),
      ]);
      const exportedPath = testInfo.outputPath(
        `text-rotated-${rotation}-annotated.pdf`
      );
      await download.saveAs(exportedPath);
      await expectPdfTextRotation(exportedPath, text, rotation);

      page.once("dialog", (dialog) => dialog.accept());
      await uploadPdf(page, exportedPath, 1);
      const exportedCanvas = page.locator(".pdf-canvas").first();
      const exportedBounds = await expectCanvasColorBounds(
        exportedCanvas,
        PEN_COLORS[1]
      );

      expect(exportedBounds.width).toBeGreaterThan(exportedBounds.height * 2);
      expect(
        Math.abs(exportedBounds.centerX - sourceBounds.centerX)
      ).toBeLessThan(10);
      expect(
        Math.abs(exportedBounds.centerY - sourceBounds.centerY)
      ).toBeLessThan(10);
    });
  }

  test("rejects unsupported text before export and allows correction", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);
    let downloadCount = 0;

    page.on("download", () => {
      downloadCount += 1;
    });

    await uploadPdf(page, fixturePath, 1);
    const annotationCanvas = page.locator(".annotation-canvas").first();
    await placeText(page, annotationCanvas, {
      x: 120,
      y: 180,
      text: "Cannot export 😀",
    });

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "export" })
    );

    await expect(page.getByRole("status")).toHaveText(
      "cannot export “😀” (U+1F600) on page 1; Helvetica does not support this character"
    );
    expect(downloadCount).toBe(0);
    await expect(page.locator("#document-count")).toHaveText(
      "1/1 pages | 1 annotation"
    );

    await doubleClickCanvasAt(page, annotationCanvas, { x: 140, y: 190 });
    const editor = page.getByRole("textbox", {
      name: "edit text annotation",
    });
    await expect(editor).toHaveValue("Cannot export 😀");
    await editor.fill("Can export now");
    await page.keyboard.press("Control+Enter");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clickToolbarControl(page, page.getByRole("button", { name: "export" })),
    ]);
    const exportedPath = testInfo.outputPath("corrected-text-annotated.pdf");
    await download.saveAs(exportedPath);
    await expectPdfContainsText(exportedPath, ["Can export now"]);
  });

  test("erases whole strokes with E and supports undo, redo, and export", async ({
    page,
  }, testInfo) => {
    const fixturePath = await createPdfFixture(testInfo, 1);

    await uploadPdf(page, fixturePath, 1);

    const annotationCanvas = page.locator(".annotation-canvas").first();
    const documentCount = page.locator("#document-count");

    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "red pen" })
    );
    await drawStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await clickToolbarControl(
      page,
      page.getByRole("button", { name: "green pen" })
    );
    await drawStroke(page, annotationCanvas, PEN_COLORS[2].y);

    await expect(documentCount).toHaveText("1/1 pages | 2 annotations");
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await page.locator("#pdf-input").focus();
    await moveWithEraserKey(page, annotationCanvas, PEN_COLORS[1].y, {
      expectActive: false,
    });
    await expect(page.getByRole("status")).toHaveText("ready");
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await page.evaluate(() => document.activeElement?.blur());

    await eraseStroke(page, annotationCanvas, PEN_COLORS[1].y);
    await expect(documentCount).toHaveText("1/1 pages | 1 annotation");
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await page.keyboard.press("Control+Z");
    await expect(documentCount).toHaveText("1/1 pages | 2 annotations");
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await page.keyboard.press("Control+Shift+Z");
    await expect(documentCount).toHaveText("1/1 pages | 1 annotation");
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    await eraseStroke(page, annotationCanvas, PEN_COLORS[2].y);
    await expect(documentCount).toHaveText("1/1 pages | 0 annotations");
    await expectCanvasToBeEmpty(annotationCanvas);

    await page.keyboard.press("Control+Z");
    await expect(documentCount).toHaveText("1/1 pages | 1 annotation");
    await expectCanvasLacksColor(annotationCanvas, PEN_COLORS[1]);
    await expectCanvasHasColor(annotationCanvas, PEN_COLORS[2]);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clickToolbarControl(page, page.getByRole("button", { name: "export" })),
    ]);

    expect(download.suggestedFilename()).toBe("fixture-1-page-annotated.pdf");

    const exportedPath = testInfo.outputPath("fixture-1-page-erased.pdf");
    await download.saveAs(exportedPath);
    await expectPdfPageCount(exportedPath, 1);

    page.once("dialog", (dialog) => dialog.accept());
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
      { label: "small", value: "2", y: 140 },
      { label: "med", value: "5", y: 180 },
      { label: "large", value: "10", y: 220 },
    ];
    const measuredInk = [];
    const widthButton = page.locator("#width-button");

    await expect(widthButton).toHaveRole("button");

    for (const option of widthOptions) {
      await expect(widthButton).toHaveText(option.label);
      await expect(widthButton).toHaveAttribute(
        "aria-label",
        `stroke width: ${option.label}`
      );
      await expect(widthButton).toHaveAttribute(
        "data-width-value",
        option.value
      );
      await drawStroke(page, annotationCanvas, option.y);
      measuredInk.push(await measureStrokeInk(annotationCanvas, option.y));
      await page.keyboard.press("Control+Z");
      await expectCanvasToBeEmpty(annotationCanvas);
      await clickToolbarControl(page, widthButton);
    }

    await expect(widthButton).toHaveText("small");

    expect(measuredInk[1]).toBeGreaterThan(measuredInk[0] * 1.6);
    expect(measuredInk[2]).toBeGreaterThan(measuredInk[1] * 1.6);
  });
});

async function createPdfFixture(
  testInfo,
  pageCount,
  {
    fileName = `fixture-${pageCount}-page.pdf`,
    rotation = 0,
    pageColor = rgb(0.9, 0.92, 0.95),
  } = {}
) {
  const fixtureDir = testInfo.outputPath("fixtures");
  await mkdir(fixtureDir, { recursive: true });

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const filePath = path.join(fixtureDir, fileName);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdfDoc.addPage([420, 560]);
    const { width, height } = page.getSize();

    if (rotation !== 0) {
      page.setRotation(degrees(rotation));
    }

    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: pageColor,
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
  await testInfo.attach(fileName, {
    body: Buffer.from(bytes),
    contentType: "application/pdf",
  });

  await writeFile(filePath, bytes);

  return filePath;
}

function shellByPageNumber(page, pageNumber) {
  return page.locator(`.page-shell[data-page-number='${pageNumber}']`);
}

/** Presses Tab `steps` times, reporting what holds focus after each press. */
async function walkTabOrder(page, steps) {
  const focused = [];

  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press("Tab");
    focused.push(await describeFocusedElement(page));
  }

  return focused;
}

async function describeFocusedElement(page) {
  return page.evaluate(() => {
    const element = document.activeElement;

    if (!element || element === document.body) return "body";
    if (element.id) return `#${element.id}`;

    const label = element.getAttribute("aria-label");
    const tagName = element.tagName.toLowerCase();

    return label ? `${tagName}[${label}]` : tagName;
  });
}

/** Writes bytes verbatim, for fixtures `pdf-lib` cannot express. */
async function writeRawFixture(testInfo, fileName, bytes) {
  const fixtureDir = testInfo.outputPath("fixtures");
  await mkdir(fixtureDir, { recursive: true });

  const filePath = path.join(fixtureDir, fileName);
  await writeFile(filePath, bytes);

  return filePath;
}

async function createNamedPdfFixture(testInfo, fileName) {
  const fixturePath = await createPdfFixture(testInfo, 1);
  const namedFixturePath = testInfo.outputPath("fixtures", fileName);

  await writeFile(namedFixturePath, await readFile(fixturePath));
  return namedFixturePath;
}

async function uploadPdf(page, filePath, pageCount) {
  await page.locator("#pdf-input").setInputFiles(filePath);

  await expectPdfReady(page, pageCount);
}

async function expectPdfReady(page, pageCount) {
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

async function dropPdf(page, filePath) {
  const bytes = await readFile(filePath);
  const fileName = path.basename(filePath);
  const dataTransfer = await page.evaluateHandle(
    ({ base64, fileName }) => {
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0)
      );
      const transfer = new DataTransfer();

      transfer.items.add(
        new File([bytes], fileName, { type: "application/pdf" })
      );
      return transfer;
    },
    { base64: bytes.toString("base64"), fileName }
  );

  try {
    await page.locator(".workspace").dispatchEvent("drop", { dataTransfer });
  } finally {
    await dataTransfer.dispose();
  }
}

async function reloadAndCollectDialogs(page, { accept = true } = {}) {
  if (!accept) {
    const dialogPromise = page.waitForEvent("dialog");

    await page.evaluate(() => {
      window.setTimeout(() => window.location.reload(), 0);
    });

    const dialog = await dialogPromise;
    const dialogs = [{ type: dialog.type(), message: dialog.message() }];

    await dialog.dismiss();
    const session = await page.context().newCDPSession(page);
    await session.send("Page.stopLoading");
    await session.detach();
    return dialogs;
  }

  const dialogs = [];
  const handleDialog = async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  };

  page.on("dialog", handleDialog);

  try {
    await page.reload();
  } finally {
    page.off("dialog", handleDialog);
  }

  return dialogs;
}

async function scrollToRenderedAnnotationCanvas(page, pageNumber) {
  const pageShell = await scrollToRenderedPageShell(page, pageNumber);
  const annotationCanvas = pageShell.locator(".annotation-canvas");
  await expect(annotationCanvas).toHaveCount(1);

  return annotationCanvas;
}

async function scrollToRenderedPageShell(page, pageNumber) {
  const pageShell = page.locator(
    `.page-shell[data-page-number='${pageNumber}']`
  );

  await expect(pageShell).toHaveCount(1);
  await pageShell.scrollIntoViewIfNeeded();
  await expect(pageShell).toHaveAttribute("data-render-state", "rendered", {
    timeout: 20_000,
  });

  return pageShell;
}

async function getCanvasBackingSize(canvas) {
  return canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
  }));
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

async function drawStrokeAtCanvasCoordinates(
  page,
  canvas,
  { startX, endX, y }
) {
  await canvas.scrollIntoViewIfNeeded();
  const metrics = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();

    return {
      left: rect.left,
      top: rect.top,
      displayWidth: rect.width,
      displayHeight: rect.height,
      backingWidth: element.width,
      backingHeight: element.height,
    };
  });
  const toClientX = (x) =>
    metrics.left + x * (metrics.displayWidth / metrics.backingWidth);
  const toClientY = (pointY) =>
    metrics.top + pointY * (metrics.displayHeight / metrics.backingHeight);

  await page.keyboard.down("Space");
  await page.mouse.move(toClientX(startX), toClientY(y));
  await page.mouse.move(toClientX(endX), toClientY(y), { steps: 12 });
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

async function placeText(page, canvas, { x, y, text }) {
  await page.keyboard.press("t");
  await clickCanvasAt(page, canvas, { x, y });
  const editor = page.getByRole("textbox", {
    name: "new text annotation",
  });

  await editor.fill(text);
  await page.keyboard.press("Control+Enter");
  await expect(editor).toBeHidden();
}

async function clickCanvasAt(page, canvas, point) {
  const clientPoint = await canvasPointToClient(canvas, point);
  await page.mouse.click(clientPoint.x, clientPoint.y);
}

async function doubleClickCanvasAt(page, canvas, point) {
  const clientPoint = await canvasPointToClient(canvas, point);
  await page.mouse.dblclick(clientPoint.x, clientPoint.y);
}

async function moveCanvasPointerTo(page, canvas, point) {
  const clientPoint = await canvasPointToClient(canvas, point);
  await page.mouse.move(clientPoint.x, clientPoint.y);
}

async function dragCanvas(page, canvas, from, to) {
  const start = await canvasPointToClient(canvas, from);
  const end = await canvasPointToClient(canvas, to);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 10 });
  await page.mouse.up();
}

/** The share of pixels in a canvas-space region with any paint. */
async function getCanvasCoverage(canvas, region) {
  return canvas.evaluate((element, { x, y, width, height }) => {
    const data = element
      .getContext("2d")
      .getImageData(x, y, width, height).data;
    let painted = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) painted += 1;
    }
    return painted / (width * height);
  }, region);
}

/**
 * Canvas-pixel points just inside both ends of the first text run, read with
 * PDF.js the way the app lays out a page, so the drag follows any rotation.
 */
async function getFirstTextLine(filePath) {
  const bytes = await readFile(filePath);
  const pdf = await getPdfDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    standardFontDataUrl:
      path.resolve("node_modules/pdfjs-dist/standard_fonts") + path.sep,
  }).promise;

  try {
    const pdfPage = await pdf.getPage(1);
    const viewport = pdfPage.getViewport({ scale: 1.5 });
    const [item] = (await pdfPage.getTextContent()).items;
    const [a, b, c, d, x, y] = Util.transform(
      viewport.transform,
      item.transform
    );
    const length = Math.hypot(a, b);
    const dir = { x: a / length, y: b / length };
    const up = { x: dir.y, y: -dir.x };
    const lift = Math.hypot(c, d) * 0.3;
    const at = (offset) => ({
      x: x + dir.x * offset + up.x * lift,
      y: y + dir.y * offset + up.y * lift,
    });

    return { start: at(2), end: at(item.width * viewport.scale - 2) };
  } finally {
    await pdf.destroy();
  }
}

/**
 * Bounds of painted (any alpha) or yellow-tinted pixels on a canvas, optionally
 * searched only within a canvas-space region. Right and bottom are exclusive.
 */
async function getPaintedBounds(canvas, mode, region = null) {
  const bounds = await canvas.evaluate(
    (element, { mode, region }) => {
      const originX = Math.round(region?.x ?? 0);
      const originY = Math.round(region?.y ?? 0);
      const width = Math.round(region?.width ?? element.width);
      const height = Math.round(region?.height ?? element.height);
      const data = element
        .getContext("2d")
        .getImageData(originX, originY, width, height).data;
      let left = Number.POSITIVE_INFINITY;
      let top = Number.POSITIVE_INFINITY;
      let right = -1;
      let bottom = -1;

      for (let index = 0; index < data.length; index += 4) {
        const isHit =
          mode === "painted"
            ? data[index + 3] > 0
            : data[index] - data[index + 2] > 40;
        if (!isHit) continue;

        const pixel = index / 4;
        const px = originX + (pixel % width);
        const py = originY + Math.floor(pixel / width);
        left = Math.min(left, px);
        top = Math.min(top, py);
        right = Math.max(right, px + 1);
        bottom = Math.max(bottom, py + 1);
      }

      return right < 0 ? null : { left, top, right, bottom };
    },
    { mode, region }
  );

  expect(bounds).not.toBeNull();
  return bounds;
}

const PASSAGE_LINES = [
  "The quick brown fox jumps over",
  "the lazy dog while the annotator",
  "highlights a passage of text.",
];
const PASSAGE_FONT_SIZE = 14;
const PASSAGE_LEFT = 36;
const PASSAGE_LINE_PITCH = 20;
const PASSAGE_PAGE_SIZE = { width: 420, height: 300 };
const PASSAGE_RENDER_SCALE = 1.5;
// Helvetica's cap height is about 0.72 em and its descenders reach 0.21 em.
const HELVETICA_CAP_HEIGHT = 0.72;
const HELVETICA_DESCENT = 0.21;
/** Letters within a word are never this far apart; spaces always are. */
const WORD_GAP = 4;
/** Slack between a glyph's advance box and its ink, in canvas pixels. */
const WORD_EDGE_TOLERANCE = 3;

/**
 * A white page of dark Helvetica text. Once it is open, `measure` locates
 * every word from the ink PDF.js actually painted, so assertions compare the
 * highlight against what the reader sees rather than against the app's own
 * glyph-width estimate.
 */
async function createPassageFixture(testInfo) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pdfPage = pdfDoc.addPage([
    PASSAGE_PAGE_SIZE.width,
    PASSAGE_PAGE_SIZE.height,
  ]);
  const baselines = PASSAGE_LINES.map(
    (_, index) => 240 - index * PASSAGE_LINE_PITCH
  );

  PASSAGE_LINES.forEach((line, index) => {
    pdfPage.drawText(line, {
      x: PASSAGE_LEFT,
      y: baselines[index],
      size: PASSAGE_FONT_SIZE,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
  });

  const filePath = await writeRawFixture(
    testInfo,
    "passage.pdf",
    Buffer.from(await pdfDoc.save())
  );
  const toCanvas = (points) => points * PASSAGE_RENDER_SCALE;
  const baselineOf = (lineIndex) =>
    toCanvas(PASSAGE_PAGE_SIZE.height - baselines[lineIndex]);

  /** A full-width strip that holds one line and none of its neighbours. */
  const lineStrip = (lineIndex) => {
    const pitch = toCanvas(PASSAGE_LINE_PITCH);
    return {
      x: 0,
      y: baselineOf(lineIndex) - pitch * 0.75,
      width: toCanvas(PASSAGE_PAGE_SIZE.width),
      height: pitch,
    };
  };

  return {
    filePath,
    lineStrip,

    async measure(page) {
      const pdfCanvas = page.locator(".pdf-canvas").first();
      const inkByLine = [];

      for (const [lineIndex, line] of PASSAGE_LINES.entries()) {
        const spans = await getInkSpans(pdfCanvas, lineStrip(lineIndex));
        expect(spans).toHaveLength(line.split(" ").length);
        inkByLine.push(spans);
      }

      return (lineIndex, word) => {
        const words = PASSAGE_LINES[lineIndex].split(" ");
        const wordIndex = words.indexOf(word);
        expect(wordIndex).toBeGreaterThanOrEqual(0);

        const { left, right } = inkByLine[lineIndex][wordIndex];
        const baseline = baselineOf(lineIndex);
        const top =
          baseline - toCanvas(PASSAGE_FONT_SIZE * HELVETICA_CAP_HEIGHT);
        const bottom =
          baseline + toCanvas(PASSAGE_FONT_SIZE * HELVETICA_DESCENT);
        const midline = baseline - toCanvas(PASSAGE_FONT_SIZE * 0.3);

        return {
          box: { x: left, y: top, width: right - left, height: bottom - top },
          // One pixel inside the word's ink, so the carets land on its edges.
          startPoint: { x: left + 1, y: midline },
          endPoint: { x: right - 1, y: midline },
        };
      };
    },
  };
}

/**
 * Horizontal runs of dark pixels in a canvas-space region, split wherever a
 * gap is wide enough to be a space: one span per rendered word.
 */
async function getInkSpans(canvas, region) {
  return canvas.evaluate(
    (element, { region, wordGap }) => {
      const x = Math.round(region.x);
      const y = Math.round(region.y);
      const width = Math.round(region.width);
      const height = Math.round(region.height);
      const data = element
        .getContext("2d")
        .getImageData(x, y, width, height).data;
      const spans = [];

      for (let column = 0; column < width; column += 1) {
        let isInk = false;
        for (let row = 0; row < height && !isInk; row += 1) {
          const index = (row * width + column) * 4;
          isInk = data[index] + data[index + 1] + data[index + 2] < 384;
        }
        if (!isInk) continue;

        const last = spans.at(-1);
        if (last && x + column - last.right < wordGap) {
          last.right = x + column + 1;
        } else {
          spans.push({ left: x + column, right: x + column + 1 });
        }
      }

      return spans;
    },
    { region, wordGap: WORD_GAP }
  );
}

/** The box from the start of one word to the end of another on its line. */
function spanWords(first, last) {
  return {
    box: {
      x: first.box.x,
      y: first.box.y,
      width: last.box.x + last.box.width - first.box.x,
      height: first.box.height,
    },
  };
}

/**
 * A band must cover the word's full width, stop at its edges rather than
 * spilling into the neighbouring spaces, and stay within its own line.
 */
function expectBandOverWord(bounds, { box }) {
  expect(Math.abs(bounds.left - box.x)).toBeLessThan(WORD_EDGE_TOLERANCE);
  expect(Math.abs(bounds.right - (box.x + box.width))).toBeLessThan(
    WORD_EDGE_TOLERANCE
  );
  expect(bounds.top).toBeLessThanOrEqual(box.y + 1);
  expect(bounds.bottom).toBeGreaterThanOrEqual(box.y + box.height - 1);
  expect(bounds.bottom - bounds.top).toBeLessThan(
    PASSAGE_LINE_PITCH * PASSAGE_RENDER_SCALE
  );
}

/** Checks exported QuadPoints, in PDF points, against canvas-space boxes. */
function expectQuadsOverWords(quadPoints, words) {
  expect(quadPoints).toHaveLength(words.length * 8);

  words.forEach((word, index) => {
    const quad = quadPoints.slice(index * 8, index * 8 + 8);
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const toCanvasY = (y) =>
      (PASSAGE_PAGE_SIZE.height - y) * PASSAGE_RENDER_SCALE;

    // Top-left, top-right, bottom-left, bottom-right, as readers expect.
    expect(quad[1]).toBe(quad[3]);
    expect(quad[5]).toBe(quad[7]);
    expect(quad[1]).toBeGreaterThan(quad[5]);
    expect(quad[0]).toBeLessThan(quad[2]);

    expectBandOverWord(
      {
        left: Math.min(...xs) * PASSAGE_RENDER_SCALE,
        right: Math.max(...xs) * PASSAGE_RENDER_SCALE,
        top: toCanvasY(Math.max(...ys)),
        bottom: toCanvasY(Math.min(...ys)),
      },
      word
    );
  });
}

async function exportPdf(page, testInfo, fileName) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    clickToolbarControl(page, page.getByRole("button", { name: "export" })),
  ]);
  const exportedPath = testInfo.outputPath(fileName);
  await download.saveAs(exportedPath);
  return exportedPath;
}

async function getPdfAnnotations(filePath) {
  const bytes = await readFile(filePath);
  const pdf = await getPdfDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    standardFontDataUrl:
      path.resolve("node_modules/pdfjs-dist/standard_fonts") + path.sep,
  }).promise;

  try {
    return await (await pdf.getPage(1)).getAnnotations();
  } finally {
    await pdf.destroy();
  }
}

async function canvasPointToClient(canvas, point) {
  await canvas.scrollIntoViewIfNeeded();

  return canvas.evaluate((element, point) => {
    const rect = element.getBoundingClientRect();

    return {
      x: rect.left + point.x * (rect.width / element.width),
      y: rect.top + point.y * (rect.height / element.height),
    };
  }, point);
}

async function expectPdfPageCount(filePath, expectedPageCount) {
  const bytes = await readFile(filePath);
  const pdfDoc = await PDFDocument.load(bytes);

  expect(pdfDoc.getPageCount()).toBe(expectedPageCount);
}

async function expectPdfContainsText(filePath, expectedLines) {
  const bytes = await readFile(filePath);
  const loadingTask = getPdfDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    standardFontDataUrl:
      path.resolve("node_modules/pdfjs-dist/standard_fonts") + path.sep,
  });
  const pdf = await loadingTask.promise;

  try {
    const pdfPage = await pdf.getPage(1);
    const textContent = await pdfPage.getTextContent();
    const extractedText = textContent.items.map((item) => item.str).join(" ");

    for (const line of expectedLines) {
      expect(extractedText).toContain(line);
      const item = textContent.items.find((candidate) =>
        candidate.str.includes(line)
      );
      expect(item?.height).toBeCloseTo(16, 0);
    }
  } finally {
    await pdf.destroy();
  }
}

async function expectPdfTextRotation(filePath, expectedText, expectedRotation) {
  const bytes = await readFile(filePath);
  const loadingTask = getPdfDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    standardFontDataUrl:
      path.resolve("node_modules/pdfjs-dist/standard_fonts") + path.sep,
  });
  const pdf = await loadingTask.promise;

  try {
    const pdfPage = await pdf.getPage(1);
    const textContent = await pdfPage.getTextContent();
    const item = textContent.items.find(
      (candidate) => candidate.str === expectedText
    );

    expect(item).toBeDefined();

    const rotation =
      (Math.atan2(item.transform[1], item.transform[0]) * 180) / Math.PI;
    const normalizedRotation = (rotation + 360) % 360;

    expect(normalizedRotation).toBeCloseTo(expectedRotation, 0);
  } finally {
    await pdf.destroy();
  }
}

async function expectCanvasColorBounds(canvas, color) {
  await expect
    .poll(async () => Boolean(await getCanvasColorBounds(canvas, color)), {
      message: `${color.label} pixel bounds should be present`,
    })
    .toBe(true);

  return getCanvasColorBounds(canvas, color);
}

async function getCanvasColorBounds(canvas, color) {
  const expected = hexToRgb(color.hex);

  return canvas.evaluate((element, expected) => {
    const context = element.getContext("2d");
    const { width, height } = element;
    const data = context.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3];

        if (
          alpha < 80 ||
          Math.abs(data[index] - expected.r) > 40 ||
          Math.abs(data[index + 1] - expected.g) > 40 ||
          Math.abs(data[index + 2] - expected.b) > 40
        ) {
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX === -1) return null;

    const boundsWidth = maxX - minX + 1;
    const boundsHeight = maxY - minY + 1;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: boundsWidth,
      height: boundsHeight,
      centerX: minX + boundsWidth / 2,
      centerY: minY + boundsHeight / 2,
    };
  }, expected);
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
