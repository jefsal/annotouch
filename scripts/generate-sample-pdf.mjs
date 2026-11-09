import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// All coordinates below are in points, measured from the top of a Letter page.
const WIDTH = 612;
const HEIGHT = 792;
const LEFT = 48;
const RIGHT = WIDTH - LEFT;
const ink = rgb(0x17 / 255, 0x19 / 255, 0x23 / 255);
const blue = rgb(0x1f / 255, 0x6f / 255, 0xeb / 255);
const muted = rgb(0.4, 0.43, 0.48);
const guide = rgb(0.86, 0.88, 0.9);
const trace = rgb(0.73, 0.76, 0.8);
const pdf = await PDFDocument.create();
const fixedDate = new Date("2025-01-01T00:00:00.000Z");
pdf.setTitle("Annotouch sample worksheet");
pdf.setAuthor("Annotouch");
pdf.setSubject("A hands-on worksheet for freehand PDF annotation");
pdf.setCreator("Annotouch");
pdf.setProducer("Annotouch / pdf-lib");
pdf.setCreationDate(fixedDate);
pdf.setModificationDate(fixedDate);
const sans = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const serif = await pdf.embedFont(StandardFonts.TimesRoman);
const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

function text(page, value, x, top, size = 11, font = sans, color = ink) {
  page.drawText(value, { x, y: HEIGHT - top - size, size, font, color });
}

function line(page, x1, top1, x2, top2, color = guide, thickness = 0.6, dash) {
  page.drawLine({
    start: { x: x1, y: HEIGHT - top1 },
    end: { x: x2, y: HEIGHT - top2 },
    color,
    thickness,
    ...(dash ? { dashArray: dash } : {}),
  });
}

function path(page, data, x, top, color = trace, width = 1, dashed = true) {
  page.drawSvgPath(data, {
    x,
    y: HEIGHT - top,
    borderColor: color,
    borderWidth: width,
    ...(dashed ? { borderDashArray: [3, 4] } : {}),
  });
}

function heading(page, number, title, instruction, top) {
  text(page, number.padStart(2, "0"), LEFT, top + 1, 11, bold, blue);
  text(page, title, LEFT + 29, top, 17, bold);
  text(page, instruction, LEFT, top + 29, 11, sans, muted);
}

function page(label, number) {
  const sheet = pdf.addPage([WIDTH, HEIGHT]);
  text(sheet, "ANNOTOUCH / TRY IT ON PAPER", LEFT, 31, 9, bold, blue);
  text(sheet, label, LEFT, 57, 25, serif);
  line(sheet, LEFT, 745, RIGHT, 745);
  text(
    sheet,
    "Hold Space. Move to draw. Release to stop.",
    LEFT,
    756,
    9,
    sans,
    muted
  );
  const count = `${number} / 3`;
  text(
    sheet,
    count,
    RIGHT - sans.widthOfTextAtSize(count, 9),
    756,
    9,
    sans,
    muted
  );
  return sheet;
}

const first = page("Annotouch sample worksheet", 1);
text(
  first,
  "Hold Space and move the pointer to draw; release to stop.",
  LEFT,
  94,
  11
);
heading(
  first,
  "1",
  "Work through a calculation",
  "Evaluate the definite integral using integration by parts. Show your steps.",
  144
);
// Integral and fraction bar are vector paths; exponents and limits are placed
// independently, avoiding Unicode math glyphs unsupported by standard fonts.
path(
  first,
  "M 21 0 C 5 -5 17 47 3 44 C 0 43 0 40 2 39",
  67,
  205,
  ink,
  1.5,
  false
);
text(first, "1", 91, 199, 11, serif);
text(first, "0", 83, 244, 11, serif);
text(first, "x", 124, 209, 23, italic);
text(first, "2", 137, 210, 12, serif);
line(first, 114, 236, 161, 236, ink, 0.9);
text(first, "e", 127, 233, 23, italic);
text(first, "x", 139, 236, 12, italic);
text(first, "dx", 175, 219, 23, italic);
text(first, "YOUR WORK", 244, 226, 8, bold, muted);
for (const top of [291, 325, 359, 393, 427, 461, 495]) {
  line(first, LEFT, top, RIGHT, top);
}
heading(
  first,
  "2",
  "Take a quick game break",
  "Play tic-tac-toe with a friend. Draw your own Xs and Os.",
  524
);
for (const x of [84, 360]) {
  for (const offset of [54, 108]) {
    line(first, x + offset, 574, x + offset, 736, ink, 1.1);
    line(first, x, 574 + offset, x + 162, 574 + offset, ink, 1.1);
  }
}

const second = page("Read. Mark. Think.", 2);
heading(
  second,
  "3",
  "Underline what matters",
  "Underline the key claims or terms in this short passage.",
  114
);
const passage = [
  "Good notes do more than repeat a page. They connect new ideas",
  "to what you already know. A question in the margin can reveal a",
  "gap in understanding; a short summary can make an argument",
  "easier to remember. Leave room to return with a fresh thought.",
];
passage.forEach((value, index) =>
  text(second, value, LEFT, 180 + index * 30, 15, serif)
);
line(second, LEFT, 324, RIGHT, 324);
heading(
  second,
  "4",
  "Have a conversation with a quote",
  "Add a question, a connection, or a disagreement in the open margins.",
  350
);
// Public-domain excerpt: Henry David Thoreau, Walden (1854), chapter II.
// Source: https://www.gutenberg.org/files/205/205-h/205-h.htm
text(second, '"I went to the woods because', 148, 464, 21, serif);
text(second, 'I wished to live deliberately..."', 148, 495, 21, serif);
text(second, "Henry David Thoreau", 148, 542, 11, bold);
text(second, "Walden (1854), excerpt", 148, 561, 11, italic, muted);
text(second, "YOUR RESPONSE", LEFT, 660, 8, bold, muted);
line(second, LEFT, 705, RIGHT, 705);

const third = page("Make your mark.", 3);
heading(
  third,
  "5",
  "Strike out the wrong answers",
  "For each question, cross out both wrong options. Leave the correct one.",
  114
);
text(third, "Which number is prime?", LEFT, 177, 14, bold);
text(third, "A. 21", 64, 211, 15, serif);
text(third, "B. 29", 235, 211, 15, serif);
text(third, "C. 39", 406, 211, 15, serif);
text(third, "Which unit measures electrical resistance?", LEFT, 260, 14, bold);
text(third, "A. Volt", 64, 294, 15, serif);
text(third, "B. Watt", 235, 294, 15, serif);
text(third, "C. Ohm", 406, 294, 15, serif);
line(third, LEFT, 339, RIGHT, 339);
heading(
  third,
  "6",
  "Trace a little landscape",
  "Follow the light dashed outlines. Add a detail of your own if you like.",
  364
);
// One continuous canopy, two open cloud outlines, a sun, and rolling hills.
// These are printed tracing guides, never example pen strokes or answers.
path(
  third,
  "M 0 174 C 70 137 118 173 178 159 C 245 136 309 171 360 150 C 410 133 450 152 480 166",
  66,
  458
);
path(
  third,
  "M 99 159 L 99 105 M 118 157 L 118 105 M 99 128 L 83 113 M 118 119 L 131 106",
  66,
  458
);
path(
  third,
  "M 82 109 C 51 118 42 91 60 78 C 41 60 61 37 80 43 C 84 14 116 14 124 38 C 151 25 169 51 153 69 C 181 88 155 120 132 107 C 117 123 94 123 82 109 Z",
  66,
  458
);
path(
  third,
  "M 0 30 C -8 13 9 2 23 10 C 25 -8 51 -10 58 8 C 79 -2 92 17 82 30 Z",
  274,
  468
);
path(
  third,
  "M 0 26 C -7 10 10 0 23 8 C 29 -11 53 -7 57 10 C 74 4 84 20 75 26 Z",
  435,
  511
);
// A circular outline constructed from cubic curves for consistent dash styling.
path(
  third,
  "M 24 0 C 37.255 0 48 10.745 48 24 C 48 37.255 37.255 48 24 48 C 10.745 48 0 37.255 0 24 C 0 10.745 10.745 0 24 0 Z",
  415,
  443
);
for (let i = 0; i < 8; i += 1) {
  const angle = (i * Math.PI) / 4;
  line(
    third,
    439 + 33 * Math.cos(angle),
    467 + 33 * Math.sin(angle),
    439 + 44 * Math.cos(angle),
    467 + 44 * Math.sin(angle),
    trace,
    1,
    [3, 4]
  );
}
heading(
  third,
  "7",
  "Sign it your way",
  "Try a signature, initials, or a tiny personal mark.",
  661
);
line(third, LEFT, 730, 350, 730);
text(third, "YOUR MARK", 370, 718, 8, bold, muted);

const output = new URL(
  "../public/samples/annotouch-sample.pdf",
  import.meta.url
);
await mkdir(new URL(".", output), { recursive: true });
const bytes = await pdf.save();
await writeFile(output, bytes);
// An explicit Node import keeps this script independent of ESLint's globals.
const { stdout } = await import("node:process");
stdout.write(
  `Wrote ${fileURLToPath(output)} (${bytes.length} bytes, 3 pages)\n`
);
