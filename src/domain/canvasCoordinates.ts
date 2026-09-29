import type { Point } from "./types";

export interface CanvasDisplayScale {
  x: number;
  y: number;
}

export interface PointerPosition {
  clientX: number;
  clientY: number;
}

/**
 * Ratio between a canvas' displayed size and its backing store. Zoom only
 * changes the displayed size, so this is what keeps stored annotation
 * coordinates independent of `viewScale`.
 */
export function getCanvasDisplayScale(
  canvas: HTMLCanvasElement
): CanvasDisplayScale {
  const rect = canvas.getBoundingClientRect();

  if (canvas.width === 0 || canvas.height === 0) {
    return { x: 1, y: 1 };
  }

  return {
    x: rect.width / canvas.width,
    y: rect.height / canvas.height,
  };
}

/**
 * Converts a viewport pointer position into canvas-pixel space, or returns
 * null when the pointer is outside the canvas.
 */
export function getCanvasPoint(
  canvas: HTMLCanvasElement | null,
  position: PointerPosition
): Point | null {
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  const x = position.clientX - rect.left;
  const y = position.clientY - rect.top;

  if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
    return null;
  }

  return {
    x: x * (canvas.width / rect.width),
    y: y * (canvas.height / rect.height),
  };
}

/**
 * Like `getCanvasPoint`, but clamps a pointer outside the canvas to its nearest
 * edge, so a drag that started on a page keeps tracking after leaving it.
 */
export function getClampedCanvasPoint(
  canvas: HTMLCanvasElement,
  position: PointerPosition
): Point | null {
  if (canvas.width === 0 || canvas.height === 0) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }

  const x = clamp(position.clientX - rect.left, 0, rect.width);
  const y = clamp(position.clientY - rect.top, 0, rect.height);

  return {
    x: x * (canvas.width / rect.width),
    y: y * (canvas.height / rect.height),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
