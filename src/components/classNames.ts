export type ClassValue = string | false | null | undefined;

/** Joins conditional class lists; later values win by CSS order, not priority. */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}

/**
 * The application focus ring. Every focusable control uses this: the global
 * `button:focus-visible` rule that used to supply it is gone, and a browser
 * default outline is not an acceptable substitute.
 */
export const FOCUS_RING =
  "focus-visible:outline-3 focus-visible:outline-offset-2 " +
  "focus-visible:outline-action-ring";
