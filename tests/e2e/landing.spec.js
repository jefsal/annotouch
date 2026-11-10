import { expect, test } from "@playwright/test";

const LANDING = "/landing/";

test.describe("landing page", () => {
  test("presents the design's headlines and leads into the app", async ({
    page,
  }) => {
    await page.goto(LANDING);

    await expect(
      page.getByRole("heading", { level: 1, name: /Annotate your pdf/ })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A mouse is unnecessary." })
    ).toBeVisible();

    await page.getByRole("link", { name: /Start annotating/ }).click();

    await expect(page).toHaveURL("/");
    await expect(page.locator("#app")).not.toBeEmpty();
  });

  test("every path into the app resolves to the app root", async ({ page }) => {
    await page.goto(LANDING);

    const appLinks = page.getByRole("link", {
      name: /Open Annotouch|Start annotating/,
    });
    await expect(appLinks).toHaveCount(3);
    for (const link of await appLinks.all()) {
      expect(await link.evaluate((anchor) => anchor.pathname)).toBe("/");
    }
  });

  test("in-page links land on their sections", async ({ page }) => {
    await page.goto(LANDING);

    await page.getByRole("link", { name: /See how it works/ }).click();
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page.locator("[data-demo-frame]")).toBeInViewport();

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Features" })
      .click();
    await expect(page).toHaveURL(/#features$/);
    await expect(
      page.getByRole("heading", { name: /No need for/ })
    ).toBeInViewport();
  });

  test("embeds the real editor on the sample worksheet", async ({ page }) => {
    await page.goto(LANDING);
    await page.locator("#how-it-works").scrollIntoViewIfNeeded();

    const demo = page.frameLocator("[data-demo-frame]");
    await expect(demo.locator("#document-name")).toHaveText(
      "annotouch-sample.pdf"
    );
    await expect(demo.locator("#document-count")).toHaveText(
      "3/3 pages | 0 annotations"
    );
    await expect(demo.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("lets a visitor draw in the demo after opting in", async ({ page }) => {
    await page.goto(LANDING);
    await page.locator("#how-it-works").scrollIntoViewIfNeeded();

    const demo = page.frameLocator("[data-demo-frame]");
    const canvas = demo.locator(".annotation-canvas").first();
    await expect(canvas).toBeVisible();

    await page.getByRole("button", { name: "Try the editor" }).click();
    await expect(
      page.getByRole("button", { name: "Try the editor" })
    ).toHaveCount(0);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const y = box.y + Math.min(260, box.height / 2);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.move(box.x + 120, y);
    await page.keyboard.down("Space");
    await page.mouse.move(box.x + 360, y, { steps: 12 });
    await page.keyboard.up("Space");

    await expect(demo.locator("#document-count")).toHaveText(
      "3/3 pages | 1 annotation"
    );
    // Space went to the editor instead of scrolling the landing page.
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test("demo opens in light mode without reading saved preferences", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("annotouch-theme", "night"));

    await page.goto("/?demo");
    await expect(page.locator("#document-name")).toHaveText(
      "annotouch-sample.pdf"
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(
      await page.evaluate(() => localStorage.getItem("annotouch-theme"))
    ).toBe("night");
  });

  test("header hides while scrolling down and returns on scroll up", async ({
    page,
  }) => {
    await page.goto(LANDING);
    const header = page.locator("[data-site-header]");
    await expect(header).toBeInViewport();

    await page.mouse.move(40, 40);
    await page.mouse.wheel(0, 900);
    await expect(header).toHaveAttribute("data-hidden", "");
    await expect(header).not.toBeInViewport();

    await page.mouse.wheel(0, -300);
    await expect(header).not.toHaveAttribute("data-hidden");
    await expect(header).toBeInViewport();

    await page.mouse.wheel(0, 600);
    await expect(header).toHaveAttribute("data-hidden", "");
    await page.keyboard.press("Tab");
    await expect(header).not.toHaveAttribute("data-hidden");
  });

  test("makes no third-party requests", async ({ page, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const external = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith("http") && url.origin !== origin) {
        external.push(request.url());
      }
    });

    await page.goto(LANDING, { waitUntil: "networkidle" });

    expect(external).toEqual([]);
  });

  test("loads the headline font and dither artwork", async ({ page }) => {
    await page.goto(LANDING, { waitUntil: "networkidle" });

    // fonts.check() also returns true when no matching face is registered, so
    // look for a loaded face rather than relying on it alone.
    const loadedFamilies = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts]
        .filter((face) => face.status === "loaded")
        .map((face) => face.family.replaceAll('"', ""));
    });
    expect(loadedFamilies).toContain("Inter Tight Variable");

    const dither = page.locator('img[src*="dither-signal"]').first();
    expect(await dither.evaluate((image) => image.naturalWidth)).toBe(318);
  });

  for (const width of [320, 375, 768, 1024, 1440, 1920]) {
    test(`has no horizontal page scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(LANDING);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      await expect(
        page.getByRole("link", { name: /Start annotating/ })
      ).toBeVisible();
    });
  }
});
