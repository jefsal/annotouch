/**
 * A structurally valid PDF that carries no pages. PDF.js loads it happily, so
 * without this the app would show an empty workspace with the drop affordance
 * hidden and export enabled.
 */
export class EmptyPdfDocumentError extends Error {
  constructor() {
    super("the PDF has no pages");
    this.name = "EmptyPdfDocumentError";
  }
}

interface UnsupportedTextCharacterErrorInput {
  character: string;
  pageNumber: number;
}

export class UnsupportedTextCharacterError extends Error {
  readonly character: string;
  readonly codePoint: number;
  readonly pageNumber: number;

  constructor({ character, pageNumber }: UnsupportedTextCharacterErrorInput) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      throw new TypeError("character must contain at least one code point");
    }

    const codePointLabel = `U+${codePoint
      .toString(16)
      .toUpperCase()
      .padStart(4, "0")}`;

    super(
      `cannot export “${character}” (${codePointLabel}) on page ${pageNumber}; Helvetica does not support this character`
    );
    this.name = "UnsupportedTextCharacterError";
    this.character = character;
    this.codePoint = codePoint;
    this.pageNumber = pageNumber;
  }
}
