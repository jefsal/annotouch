# Annotouch

Annotouch is a local-first browser app for marking up PDFs with keyboard-driven
pointer controls. Files and annotations stay in your browser and are never
uploaded to a server.

## Why Annotouch

Annotouch began as a way to take class notes without a tablet or repetitive
trackpad clicks. Its hold-to-draw interaction was inspired by
[osu!](https://github.com/ppy/osu).

## Features

- Draw without clicking: hold `Space`, move the pointer, and release to finish.
- Add editable multiline text, erase whole annotations, and use colors, stroke
  widths, undo, and redo.
- Work with local PDFs in light or night mode, with an optional workspace
  background.
- Export an annotated copy without changing the source PDF.

Press `E` to erase, `T` to add text, `W` to cycle stroke widths, or `⌘ K` to
view every keyboard shortcut.

## Development

Annotouch uses Vite, TypeScript, Preact, Tailwind CSS, PDF.js, and pdf-lib. Use a
current LTS release of Node.js.

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

Install Chromium once, then run the browser suite:

```sh
npx playwright install chromium
npm run test:e2e
```

Build and preview the production bundle:

```sh
npm run build
npm run preview
```

## Architecture

```text
Browser input + local PDF
          │
          ▼
Preact UI · src/components/
          │
          ▼
State + orchestration · src/app/
          │
          ├── Annotation model + geometry · src/domain/
          ├── Canvas interaction · annotator / textEditor
          └── PDF rendering + export · pdfViewer / exporter
```

- `src/components/` renders the Preact interface; `src/components/App.tsx`
  connects application state, preferences, shortcuts, and document actions.
- `src/app/` owns typed state, configuration, shortcuts, preferences, and the
  PDF lifecycle.
- `src/domain/` and the top-level annotation modules handle geometry, drawing,
  text editing, history, page rendering, and export.
- `src/styles/` contains the design system; `tests/unit/` and `tests/e2e/`
  cover domain behavior and browser workflows.

## PDF Limits

Annotouch renders and annotates the first 200 pages of a PDF. When exporting a
larger document, it preserves every later page unchanged.
