import { describe, expect, it, vi } from "vitest";

import {
  DEMO_SAMPLE_URL,
  fetchDemoDocument,
  getFitWidthScale,
  isDemoMode,
} from "../../src/app/demo";

describe("isDemoMode", () => {
  it("is on only when the demo parameter is present", () => {
    expect(isDemoMode("?demo")).toBe(true);
    expect(isDemoMode("?demo=1&x=2")).toBe(true);
    expect(isDemoMode("")).toBe(false);
    expect(isDemoMode("?demonstration")).toBe(false);
  });
});

describe("getFitWidthScale", () => {
  it("never zooms past 100%", () => {
    expect(getFitWidthScale(2000, 918)).toBe(1);
  });

  it("rounds down to a zoom step that fits", () => {
    expect(getFitWidthScale(1000, 918)).toBe(1);
    expect(getFitWidthScale(900, 918)).toBe(0.9);
    expect(getFitWidthScale(500, 918)).toBe(0.5);
    expect(getFitWidthScale(320, 918)).toBe(0.3);
  });

  it("stays within the zoom range", () => {
    expect(getFitWidthScale(10, 918)).toBe(0.1);
  });

  it("falls back to 100% without usable measurements", () => {
    expect(getFitWidthScale(0, 918)).toBe(1);
    expect(getFitWidthScale(800, 0)).toBe(1);
  });
});

describe("fetchDemoDocument", () => {
  it("wraps the sample as a PDF file", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(["%PDF-1.4"])),
      } as Response)
    );

    const file = await fetchDemoDocument(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(DEMO_SAMPLE_URL);
    expect(file.name).toBe("annotouch-sample.pdf");
    expect(file.type).toBe("application/pdf");
  });

  it("rejects a failed request", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, status: 404 } as Response)
    );

    await expect(fetchDemoDocument(fetchMock)).rejects.toThrow("404");
  });
});
