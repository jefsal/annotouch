import { describe, expect, it } from "vitest";

import {
  getCaretAtPoint,
  getSelectionRects,
  getSelectionText,
  layoutPageText,
  type TextRun,
} from "../../src/domain/textSelection";

/** Ten canvas pixels per glyph, 8 above and 2 below the baseline. */
function run(text: string, x: number, y: number, extra: Partial<TextRun> = {}) {
  return {
    text,
    x,
    y,
    dirX: 1,
    dirY: 0,
    length: text.length * 10,
    ascent: 8,
    descent: 2,
    fontFamily: "sans-serif",
    hasEOL: false,
    ...extra,
  } satisfies TextRun;
}

const twoLines = layoutPageText([
  run("hello world", 100, 100, { hasEOL: true }),
  run("second line", 100, 120),
]);

describe("text selection", () => {
  it("lays glyphs out along the run's baseline", () => {
    expect(twoLines.glyphs).toHaveLength(22);
    expect(twoLines.glyphs[1]).toMatchObject({
      char: "e",
      bounds: { x: 110, y: 92, width: 10, height: 10 },
    });
  });

  it("scales measured glyph widths to the run's advance", () => {
    const layout = layoutPageText([run("iw", 0, 10)], (char) =>
      char === "w" ? 3 : 1
    );

    expect(layout.glyphs.map((glyph) => glyph.end - glyph.start)).toEqual([
      5, 15,
    ]);
  });

  it("rotates glyph boxes with the run direction", () => {
    const layout = layoutPageText([run("ab", 50, 50, { dirX: 0, dirY: 1 })]);

    // Baseline runs downward; the glyph's top faces right.
    expect(layout.glyphs[0]?.bounds).toEqual({
      x: 48,
      y: 50,
      width: 10,
      height: 10,
    });
  });

  it("places the caret on the nearer side of the nearest glyph", () => {
    expect(getCaretAtPoint(twoLines, { x: 112, y: 96 })).toBe(1);
    expect(getCaretAtPoint(twoLines, { x: 118, y: 96 })).toBe(2);
    expect(getCaretAtPoint(twoLines, { x: 20, y: 116 })).toBe(11);
    expect(getCaretAtPoint(twoLines, { x: 20, y: 116 }, 24)).toBeNull();
  });

  it("builds one band per line and trims edge whitespace", () => {
    const rects = getSelectionRects(twoLines, 6, 17);

    expect(rects).toEqual([
      { x: 160, y: 92, width: 50, height: 10 },
      { x: 100, y: 112, width: 60, height: 10 },
    ]);
    expect(getSelectionText(twoLines, 17, 6)).toBe("world second");
    expect(getSelectionRects(twoLines, 5, 6)).toEqual([]);
  });

  it("merges neighbouring runs on the same line", () => {
    const layout = layoutPageText([run("foo", 0, 10), run("bar", 32, 10)]);

    expect(getSelectionRects(layout, 0, 6)).toEqual([
      { x: 0, y: 2, width: 62, height: 10 },
    ]);
  });
});
