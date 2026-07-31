import { describe, expect, it } from "vitest";

import {
  isPointInAnnotation,
  isPointInText,
  isPointNearStroke,
  pointToSegmentDistance,
} from "../../src/domain/geometry";
import type { StrokeAnnotation, TextAnnotation } from "../../src/domain/types";

describe("annotation geometry", () => {
  const stroke: StrokeAnnotation = {
    id: "stroke-1",
    type: "stroke",
    color: "#111827",
    width: 4,
    points: [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ],
  };

  const text: TextAnnotation = {
    id: "text-1",
    type: "text",
    color: "#111827",
    text: "hello",
    x: 10,
    y: 20,
    width: 40,
    height: 20,
    fontSize: 16,
    lineHeight: 20,
  };

  it("measures the nearest point on a segment", () => {
    expect(
      pointToSegmentDistance(
        { x: 20, y: 15 },
        { x: 10, y: 10 },
        { x: 30, y: 10 }
      )
    ).toBe(5);
    expect(
      pointToSegmentDistance(
        { x: 13, y: 14 },
        { x: 10, y: 10 },
        { x: 10, y: 10 }
      )
    ).toBe(5);
  });

  it("hits strokes using their effective radius", () => {
    expect(isPointNearStroke({ x: 20, y: 14 }, stroke, 4)).toBe(true);
    expect(isPointNearStroke({ x: 20, y: 14.01 }, stroke, 4)).toBe(false);
    expect(
      isPointNearStroke({ x: 10, y: 10 }, { ...stroke, points: [] }, 4)
    ).toBe(false);
  });

  it("hits text bounds with tolerance", () => {
    expect(isPointInText({ x: 7, y: 17 }, text, 3)).toBe(true);
    expect(isPointInText({ x: 6.99, y: 17 }, text, 3)).toBe(false);
  });

  it("caps text tolerance without changing stroke tolerance", () => {
    expect(isPointInAnnotation({ x: 5, y: 20 }, text, 8)).toBe(false);
    expect(isPointInAnnotation({ x: 20, y: 19 }, stroke, 8)).toBe(true);
  });
});
