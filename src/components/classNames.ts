export type ClassValue = string | false | null | undefined;

/** Joins conditional class lists; later values win by CSS order, not priority. */
export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
