import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// All coordinates below are in points, measured from the top of a Letter page.
const WIDTH = 612;
const HEIGHT = 792;
const LEFT = 48;
const RIGHT = WIDTH - LEFT;
const ink = rgb(0x17 / 255, 0x19 / 255, 0x23 / 255);
const muted = rgb(0.4, 0.43, 0.48);
const guide = rgb(0.86, 0.88, 0.9);
const trace = rgb(0.73, 0.76, 0.8);
const pdf = await PDFDocument.create();
const fixedDate = new Date("2025-01-01T00:00:00.000Z");
pdf.setTitle("Sample worksheet");
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

function heading(page, title, top) {
  text(page, title, LEFT, top, 17, bold);
}

// Each section is a heading and room to work; the activity explains itself.
const first = pdf.addPage([WIDTH, HEIGHT]);
text(first, "Sample worksheet", LEFT, 48, 25, serif);

heading(first, "Integrate by parts", 120);
// Integral and fraction bar are vector paths; exponents and limits are placed
// independently, avoiding Unicode math glyphs unsupported by standard fonts.
path(
  first,
  "M 21 0 C 5 -5 17 47 3 44 C 0 43 0 40 2 39",
  67,
  175,
  ink,
  1.5,
  false
);
text(first, "1", 91, 169, 11, serif);
text(first, "0", 83, 214, 11, serif);
text(first, "x", 124, 179, 23, italic);
text(first, "2", 137, 180, 12, serif);
line(first, 114, 206, 161, 206, ink, 0.9);
text(first, "e", 127, 203, 23, italic);
text(first, "x", 139, 206, 12, italic);
text(first, "dx", 175, 189, 23, italic);
for (const top of [280, 330, 380]) {
  line(first, LEFT, top, RIGHT, top);
}

heading(first, "Tic-tac-toe", 450);
for (const x of [84, 360]) {
  for (const offset of [54, 108]) {
    line(first, x + offset, 500, x + offset, 662, ink, 1.1);
    line(first, x, 500 + offset, x + 162, 500 + offset, ink, 1.1);
  }
}

const second = pdf.addPage([WIDTH, HEIGHT]);
heading(second, "Underline the key ideas", 60);
const passage = [
  "Good notes do more than repeat a page. They connect new ideas",
  "to what you already know. A question in the margin can reveal a",
  "gap in understanding; a short summary can make an argument",
  "easier to remember. Leave room to return with a fresh thought.",
];
passage.forEach((value, index) =>
  text(second, value, LEFT, 104 + index * 30, 15, serif)
);

heading(second, "Annotate the quote", 330);
// Public-domain excerpt: Henry David Thoreau, Walden (1854), chapter II.
// Source: https://www.gutenberg.org/files/205/205-h/205-h.htm
text(second, '"I went to the woods because', 148, 430, 21, serif);
text(second, 'I wished to live deliberately..."', 148, 461, 21, serif);
text(second, "Henry David Thoreau, Walden", 148, 506, 11, sans, muted);

const third = pdf.addPage([WIDTH, HEIGHT]);
heading(third, "Cross out the wrong answers", 60);
text(third, "Which number is prime?", LEFT, 104, 14, bold);
text(third, "A. 21", 64, 136, 15, serif);
text(third, "B. 29", 235, 136, 15, serif);
text(third, "C. 39", 406, 136, 15, serif);
text(third, "Which unit measures electrical resistance?", LEFT, 184, 14, bold);
text(third, "A. Volt", 64, 216, 15, serif);
text(third, "B. Watt", 235, 216, 15, serif);
text(third, "C. Ohm", 406, 216, 15, serif);

heading(third, "Trace the landscape", 290);
// One continuous canopy, two open cloud outlines, a sun, and rolling hills.
// These are printed tracing guides, never example pen strokes or answers.
const ART = -74;
path(
  third,
  "M 0 174 C 70 137 118 173 178 159 C 245 136 309 171 360 150 C 410 133 450 152 480 166",
  66,
  458 + ART
);
path(
  third,
  "M 99 159 L 99 105 M 118 157 L 118 105 M 99 128 L 83 113 M 118 119 L 131 106",
  66,
  458 + ART
);
path(
  third,
  "M 82 109 C 51 118 42 91 60 78 C 41 60 61 37 80 43 C 84 14 116 14 124 38 C 151 25 169 51 153 69 C 181 88 155 120 132 107 C 117 123 94 123 82 109 Z",
  66,
  458 + ART
);
path(
  third,
  "M 0 30 C -8 13 9 2 23 10 C 25 -8 51 -10 58 8 C 79 -2 92 17 82 30 Z",
  274,
  468 + ART
);
path(
  third,
  "M 0 26 C -7 10 10 0 23 8 C 29 -11 53 -7 57 10 C 74 4 84 20 75 26 Z",
  435,
  511 + ART
);
// A circular outline constructed from cubic curves for consistent dash styling.
path(
  third,
  "M 24 0 C 37.255 0 48 10.745 48 24 C 48 37.255 37.255 48 24 48 C 10.745 48 0 37.255 0 24 C 0 10.745 10.745 0 24 0 Z",
  415,
  443 + ART
);
for (let i = 0; i < 8; i += 1) {
  const angle = (i * Math.PI) / 4;
  line(
    third,
    439 + 33 * Math.cos(angle),
    467 + ART + 33 * Math.sin(angle),
    439 + 44 * Math.cos(angle),
    467 + ART + 44 * Math.sin(angle),
    trace,
    1,
    [3, 4]
  );
}

heading(third, "Sign here", 630);
line(third, LEFT, 700, 350, 700, ink, 0.8);

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
