import { describe, expect, it } from "vitest";

import {
  getCanvasDisplayScale,
  getCanvasPoint,
} from "../../src/domain/canvasCoordinates";

function createCanvas({
  width = 600,
  height = 800,
  zoom = 1,
  left = 0,
  top = 0,
} = {}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;
  canvas.getBoundingClientRect = () =>
    ({
      left,
      top,
      width: width * zoom,
      height: height * zoom,
    }) as DOMRect;

  return canvas;
}

describe("canvas coordinates", () => {
  it("maps pointer positions into canvas pixel space at any zoom", () => {
    for (const zoom of [0.1, 0.5, 1, 1.5, 2]) {
      const canvas = createCanvas({ zoom, left: 40, top: 25 });
      const point = getCanvasPoint(canvas, {
        clientX: 40 + 300 * zoom,
        clientY: 25 + 400 * zoom,
      });

      expect(point?.x).toBeCloseTo(300, 6);
      expect(point?.y).toBeCloseTo(400, 6);
    }
  });

  it("rejects positions outside the displayed canvas", () => {
    const canvas = createCanvas({ zoom: 0.5, left: 10, top: 10 });

    expect(getCanvasPoint(canvas, { clientX: 9, clientY: 100 })).toBeNull();
    expect(getCanvasPoint(canvas, { clientX: 100, clientY: 9 })).toBeNull();
    expect(getCanvasPoint(canvas, { clientX: 311, clientY: 100 })).toBeNull();
    expect(getCanvasPoint(canvas, { clientX: 100, clientY: 411 })).toBeNull();
  });

  it("ignores canvases with no backing store", () => {
    const canvas = createCanvas({ width: 0, height: 0 });

    expect(getCanvasPoint(canvas, { clientX: 0, clientY: 0 })).toBeNull();
    expect(getCanvasPoint(null, { clientX: 0, clientY: 0 })).toBeNull();
    expect(getCanvasDisplayScale(canvas)).toEqual({ x: 1, y: 1 });
  });

  it("reports the display scale used to position overlays", () => {
    expect(getCanvasDisplayScale(createCanvas({ zoom: 1.5 }))).toEqual({
      x: 1.5,
      y: 1.5,
    });
  });
});
