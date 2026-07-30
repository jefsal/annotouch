# Annotouch

Annotouch is a local-first browser app for marking up PDFs without clicking or
pressing down on a trackpad. Open a PDF, hold `Space`, move the pointer over a
page, and release `Space` to finish the stroke. Hold `E` while moving over an
annotation to erase it. Press `T`, click a page, and type to add text.

PDF files and annotations stay in the browser. Annotouch does not upload the
document to a server.

## Why

I created Annotouch after realizing that not having a tablet put me at a
disadvantage while taking notes in class. Annotating a PDF with traditional
trackpad movements felt limiting. [osu!](https://github.com/ppy/osu) inspired
the idea of holding a key to draw while using pointer movement for the stroke.

## Features

- Loads local PDFs in the browser.
- Lazily renders pages as they approach the viewport.
- Supports freehand drawing, editable multiline text, and whole-annotation
  erasing.
- Stores annotations independently for each page.
- Supports multiple colors, stroke widths, undo, redo, and light/dark themes.
- Exports annotations into a new PDF without modifying the source file.

PDFs with more than 200 pages still export with their original page count. Only
pages 1–200 are currently rendered and annotatable; later pages are copied to
the exported PDF unchanged.

## Development

Annotouch uses Vite, TypeScript, Preact, Tailwind CSS, PDF.js, and pdf-lib. A
current LTS release of Node.js is recommended.

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

Run the local quality checks:

```sh
npm run typecheck
npm run lint
npm run test
npm run format:check
```

Build and preview the production bundle:

```sh
npm run build
npm run preview
```

## Browser Tests

Install Chromium once, then run the Playwright regression suite:

```sh
npx playwright install chromium
npm run test:e2e
```

`playwright.config.js` configures the browser runner, and `tests/e2e/` contains
the generated-fixture regression tests. Playwright's generated
`playwright-report/` and `test-results/` directories are ignored by Git.

## Architecture

The TypeScript/Preact refactor is intentionally incremental. The application
shell and core annotation/PDF services are typed, while `src/main.js` remains
the orchestration entry point during the controller migration. Legacy
interaction CSS is also being moved gradually into Tailwind utilities.

- `src/components/AppShell.tsx` renders the typed Preact application shell.
- `src/domain/` contains shared annotation types, geometry, rendering helpers,
  and application errors.
- `src/annotationStore.ts` owns page annotations and undo/redo history.
- `src/pdfViewer.ts` loads PDFs and renders pages with PDF.js.
- `src/exporter.ts` writes annotations into the exported PDF and is loaded only
  when an export is requested.
- `src/app/` contains typed configuration, preference, and shortcut policies.
- `src/annotator.js` handles pointer drawing, erasing, and text editing while
  that interaction layer is migrated.
- `src/styles/tailwind.css` contains the Tailwind entry point and shell styles;
  `src/style.css` still contains interaction and document-viewer styles being
  migrated.
- `src/main.js` currently connects the shell, interaction layer, PDF lifecycle,
  and export flow.
- `tests/unit/` covers typed policies and domain behavior.
- `tests/e2e/annotouch.spec.js` covers upload, lazy rendering, drawing, text,
  colors, undo/redo, page limits, themes, and PDF export.

## Refactor Status

Completed foundations include the TypeScript toolchain, typed domain and PDF
services, the Preact application shell, Tailwind shell layout, unit tests, and
lazy loading of the export pipeline. The next phase is to split the remaining
imperative controller into typed state and feature modules, then finish moving
the legacy CSS into component-scoped Tailwind styles.
