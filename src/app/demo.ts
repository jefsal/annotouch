import { MAX_VIEW_SCALE, MIN_VIEW_SCALE, VIEW_SCALE_STEP } from "./config";

/**
 * Demo mode is the app embedded on the landing page (`/?demo`). It opens the
 * bundled sample worksheet in light mode and leaves the visitor's own
 * preferences and unload behavior untouched.
 */
export const DEMO_SAMPLE_URL = "/samples/annotouch-sample.pdf";
export const DEMO_SAMPLE_FILE_NAME = "annotouch-sample.pdf";

export function isDemoMode(search: string): boolean {
  return new URLSearchParams(search).has("demo");
}

export async function fetchDemoDocument(
  fetchImpl: typeof fetch = fetch
): Promise<File> {
  const response = await fetchImpl(DEMO_SAMPLE_URL);

  if (!response.ok) {
    throw new Error(`sample PDF request failed: ${response.status}`);
  }

  return new File([await response.blob()], DEMO_SAMPLE_FILE_NAME, {
    type: "application/pdf",
  });
}

/**
 * The largest zoom step, up to 100%, at which a page of `pageWidth` fits in
 * `availableWidth`. The embedded workspace is narrower than a full window, and
 * a page that overflows sideways hides the work areas the sample asks for.
 */
export function getFitWidthScale(
  availableWidth: number,
  pageWidth: number
): number {
  if (!(availableWidth > 0) || !(pageWidth > 0)) return 1;

  const steps = Math.floor(availableWidth / pageWidth / VIEW_SCALE_STEP);
  const scale = Math.round(steps * VIEW_SCALE_STEP * 10) / 10;

  return Math.min(1, MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, scale));
}
