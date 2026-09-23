import type { Point, Rect } from "./types";

/**
 * One run of PDF text as PDF.js lays it out, already mapped into the page's
 * canvas-pixel space so it shares coordinates with stored annotations.
 */
export interface TextRun {
  text: string;
  /** Baseline origin of the run. */
  x: number;
  y: number;
  /** Unit vector along the baseline; rotated pages rotate it. */
  dirX: number;
  dirY: number;
  /** Advance of the whole run along the baseline. */
  length: number;
  /** Extent above and below the baseline. */
  ascent: number;
  descent: number;
  fontFamily: string;
  hasEOL: boolean;
}

export interface TextGlyph {
  char: string;
  runIndex: number;
  /** Offsets along the run's baseline. */
  start: number;
  end: number;
  bounds: Rect;
}

export interface PageText {
  runs: TextRun[];
  glyphs: TextGlyph[];
}

/** Returns the advance of `text` in any consistent unit. */
export type MeasureText = (text: string, fontFamily: string) => number;

/**
 * A caret sits between glyphs: caret `n` is immediately before glyph `n`, and
 * `glyphs.length` is after the last one. A selection is a pair of carets.
 */
export type TextCaret = number;

const WHITESPACE = /^\s$/u;

/**
 * Splits every run into glyph boxes. PDF.js reports only a run's total advance,
 * so each glyph's share is estimated by measuring it in the run's fallback
 * font and scaling the sum to the real advance, the same approximation the
 * PDF.js text layer makes.
 */
export function layoutPageText(
  runs: readonly TextRun[],
  measure: MeasureText = () => 1
): PageText {
  const glyphs: TextGlyph[] = [];

  runs.forEach((run, runIndex) => {
    const chars = Array.from(run.text);
    if (chars.length === 0 || run.length <= 0) return;

    const widths = chars.map((char) =>
      Math.max(0, measure(char, run.fontFamily))
    );
    const measured = widths.reduce((sum, width) => sum + width, 0);
    const scale = measured > 0 ? run.length / measured : 0;
    const evenWidth = run.length / chars.length;

    let offset = 0;
    chars.forEach((char, index) => {
      const width = scale > 0 ? (widths[index] ?? 0) * scale : evenWidth;
      const start = offset;
      const end = offset + width;
      offset = end;

      glyphs.push({
        char,
        runIndex,
        start,
        end,
        bounds: getGlyphBounds(run, start, end),
      });
    });
  });

  return { runs: [...runs], glyphs };
}

function getGlyphBounds(run: TextRun, start: number, end: number): Rect {
  // Canvas y grows downward, so "up" is the baseline direction turned left.
  const upX = run.dirY;
  const upY = -run.dirX;
  const xs: number[] = [];
  const ys: number[] = [];

  for (const offset of [start, end]) {
    const baseX = run.x + run.dirX * offset;
    const baseY = run.y + run.dirY * offset;

    xs.push(baseX + upX * run.ascent, baseX - upX * run.descent);
    ys.push(baseY + upY * run.ascent, baseY - upY * run.descent);
  }

  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: left,
    y: top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}

/**
 * Resolves a point to the caret nearest it: the closest glyph wins, and the
 * point's side of that glyph's midpoint picks the caret before or after it.
 * Returns null when no glyph lies within `maxDistance`.
 */
export function getCaretAtPoint(
  pageText: PageText,
  point: Point,
  maxDistance = Number.POSITIVE_INFINITY
): TextCaret | null {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  pageText.glyphs.forEach((glyph, index) => {
    const glyphDistance = distanceToRect(point, glyph.bounds);

    if (glyphDistance < nearestDistance) {
      nearestDistance = glyphDistance;
      nearestIndex = index;
    }
  });

  const glyph = pageText.glyphs[nearestIndex];
  const run = glyph ? pageText.runs[glyph.runIndex] : undefined;
  if (!glyph || !run || nearestDistance > maxDistance) return null;

  const along = (point.x - run.x) * run.dirX + (point.y - run.y) * run.dirY;
  return along > (glyph.start + glyph.end) / 2
    ? nearestIndex + 1
    : nearestIndex;
}

/** The glyph index range covered by two carets, without edge whitespace. */
function getSelectedRange(
  pageText: PageText,
  anchor: TextCaret,
  focus: TextCaret
): [number, number] {
  let start = Math.max(0, Math.min(anchor, focus));
  let end = Math.min(pageText.glyphs.length, Math.max(anchor, focus));

  while (start < end && isWhitespace(pageText.glyphs[start])) start += 1;
  while (end > start && isWhitespace(pageText.glyphs[end - 1])) end -= 1;

  return [start, end];
}

function isWhitespace(glyph: TextGlyph | undefined): boolean {
  return Boolean(glyph && WHITESPACE.test(glyph.char));
}

/**
 * The highlight bands for a selection: one box per run fragment, then
 * neighbouring boxes on the same line merged so a line reads as one band.
 */
export function getSelectionRects(
  pageText: PageText,
  anchor: TextCaret,
  focus: TextCaret
): Rect[] {
  const [start, end] = getSelectedRange(pageText, anchor, focus);
  const fragments: Rect[] = [];
  let current: Rect | null = null;
  let currentRun = -1;

  for (let index = start; index < end; index += 1) {
    const glyph = pageText.glyphs[index];
    if (!glyph) continue;

    if (current && glyph.runIndex === currentRun) {
      current = unionRects(current, glyph.bounds);
      fragments[fragments.length - 1] = current;
      continue;
    }

    current = { ...glyph.bounds };
    currentRun = glyph.runIndex;
    fragments.push(current);
  }

  const merged: Rect[] = [];

  for (const fragment of fragments) {
    if (fragment.width <= 0 || fragment.height <= 0) continue;

    const previous = merged[merged.length - 1];
    if (previous && isSameLine(previous, fragment)) {
      merged[merged.length - 1] = unionRects(previous, fragment);
    } else {
      merged.push(fragment);
    }
  }

  return merged;
}

/** The selected text, with line ends and runs of whitespace collapsed. */
export function getSelectionText(
  pageText: PageText,
  anchor: TextCaret,
  focus: TextCaret
): string {
  const [start, end] = getSelectedRange(pageText, anchor, focus);
  let text = "";

  for (let index = start; index < end; index += 1) {
    const glyph = pageText.glyphs[index];
    if (!glyph) continue;

    text += glyph.char;

    const next = pageText.glyphs[index + 1];
    if (next && next.runIndex !== glyph.runIndex) {
      if (pageText.runs[glyph.runIndex]?.hasEOL) text += " ";
    }
  }

  return text.replace(/\s+/gu, " ").trim();
}

function isSameLine(a: Rect, b: Rect): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const gap = Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
  const lineHeight = Math.min(a.height, b.height);

  return overlap >= lineHeight * 0.5 && gap <= lineHeight;
}

export function unionRects(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);

  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export function distanceToRect(point: Point, rect: Rect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));

  return Math.hypot(dx, dy);
}
