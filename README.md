# Annotouch

Annotouch is a browser app for marking up local PDFs without clicking or pressing a trackpad. Open a PDF, hold `Space`, move the pointer over a page, and release `Space` to finish the stroke.

## Why

I created this app because while taking notes in class I realized not having a
tablet to take notes on put me at a disadvantage when trying to learn.
Annotating a pdf for in-class work using traditional trackpad movements felt limiting.
[Osu](https://github.com/ppy/osu) inspired this solution by using a keystroke to 'click' then moving the cursor to create a 'stroke.'

## Current MVP

- Loads local PDF in the browser.
- Creates page shells and lazily renders pages as they near the viewport.
- Allows annotations on up to the first 200 pages.
- Stores strokes by page.
- Supports undo, redo, clear, and PDF export.
- Keeps pages beyond the first 200 unchanged and intact when exporting.

PDFs with more than 200 pages still export with their full original page count.
Only pages 1-200 are rendered and annotatable currently, but later pages
are preserved unchanged in the exported PDF.

## Development

```sh
npm install
npm run dev
```

Build for production:

```sh
npm run build
npm run preview
```

Run browser QA:

```sh
npx playwright install chromium
npm run test:e2e
```

The Playwright source files are part of the project and should be committed:
`playwright.config.js` configures the browser test runner, and `tests/` contains
the generated-fixture regression tests. Only Playwright's generated outputs,
`playwright-report/` and `test-results/`, are git-ignored.

## Project Structure

- `src/main.js` wires the UI, PDF loading, lazy rendering, and export flow.
- `src/pdfViewer.js` handles PDF.js document loading and page rendering.
- `src/annotator.js` handles `Space` plus pointer-movement drawing.
- `src/strokeStore.js` stores and redraws page-specific strokes.
- `src/exporter.js` writes annotations back into the exported PDF.
- `playwright.config.js` starts Vite and configures Chromium browser QA.
- `tests/e2e/annotouch.spec.js` generates PDF fixtures and covers upload, lazy rendering, drawing, color, undo, clear, capped annotation, and export regressions.

