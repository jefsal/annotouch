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
    await expect(
      page.getByRole("img", { name: /The Annotouch editor/ })
    ).toBeInViewport();

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Features" })
      .click();
    await expect(page).toHaveURL(/#features$/);
    await expect(
      page.getByRole("heading", { name: /No need for/ })
    ).toBeInViewport();
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
