# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Active Plan

[`plan.md`](plan.md) is the source of truth for the active TypeScript, Preact,
Tailwind, testing, and Cloudflare deployment roadmap. Keep its checkboxes and
migration-boundary notes current as work lands.

`CLAUDE.md` and `plan.md` are tracked in Git so the roadmap and these notes
travel with the repository. Keep them free of credentials and host details.

## Commands

```sh
npm run dev            # start Vite dev server (http://127.0.0.1:5173)
npm run build          # production build to dist/
npm run preview        # serve the production build

npm run typecheck      # TypeScript validation
npm run lint           # ESLint
npm run test           # Vitest unit tests
npm run format:check   # Prettier validation

npx playwright install chromium   # one-time, before first test run
npm run test:e2e                   # run Playwright e2e suite (auto-starts dev server)
npm run test:e2e:headed            # same, with a visible browser

npx playwright test tests/e2e/annotouch.spec.js -g "export"   # run a single test by title substring
```

Commit `playwright.config.js` and everything under `tests/`;
`playwright-report/` and `test-results/` are git-ignored.

## Architecture

Annotouch is a keyboard-first Preact, TypeScript, Tailwind, and Vite browser app
for annotating local PDFs. The refactor is incremental: Preact owns the UI
lifecycle and renders from typed state, all application source is TypeScript,
and the legacy stylesheet is the remaining migration. The interaction model is osu-inspired: hold a key and **move the
pointer** rather than clicking — hold `Space` to draw a stroke, hold `E` to
erase whole annotations under the cursor, press `T` then click to place text.
All work is in-memory; nothing is uploaded.

### Modules and how they connect

- **`src/main.tsx`** — mounts the app and imports global styles.
- **`src/components/App.tsx`** — owns `AppState` via `useReducer` and wires it to
  the document controller, keyboard shortcuts, theme, and preferences. Every
  side effect uses `useLayoutEffect`; Preact's passive effects run on an
  animation frame, which is too late for the `beforeunload` guard, page
  scaling, and the classes on the `#app` mount container.
- **`src/components/AppShell.tsx`** — renders the toolbar and composes the
  viewport, settings panel, and shortcut dialog from state and callbacks.
- **`src/app/state.ts`** — `AppState`, `AppAction`, the reducer, and the
  selectors that gate the toolbar controls.
- **`src/app/documentController.ts`** — owns everything that cannot be
  serializable UI state: PDF bytes, PDF.js objects, page shells/canvases, the
  lazy-render `IntersectionObserver`, and export. It only talks back through
  `dispatch`.
- **`src/pdfViewer.ts`** — typed wrapper over PDF.js: loads the document and renders a page's bitmap into a canvas. Sets the PDF.js worker URL.
- **`src/annotator.ts`** — all pointer/keyboard interaction for _creating_ annotations. State is one exclusive `InteractionMode` union (`idle`, `drawing`, `erasing`, `placingText`, `editingText`); document-level listeners are attached on creation and removed by `destroy()`. Reports status through `onStatusChange`.
- **`src/textEditor.ts`** — one text-annotation editing session: the textarea overlay, its measurement against the annotation canvas, and the commit/discard rules.
- **`src/domain/canvasCoordinates.ts`** — pointer→canvas-pixel conversion and display scale; this is what keeps stored coordinates independent of zoom.
- **`src/annotationStore.ts`** — the source of truth. Holds a `Map` of page number → page state; each page has one flat `annotations` array mixing `type: "stroke"` and `type: "text"`. Owns the undo/redo stacks and redraws canvases. `getAnnotationsByPage()` feeds the exporter.
- **`src/exporter.ts`** — uses `pdf-lib` to draw stored annotations back into the original PDF bytes and trigger a download. Runs independently of PDF.js and is loaded lazily when export is requested.
- **`src/domain/`** — shared annotation types, geometry, rendering helpers, and application errors.
- **`src/app/`** — also holds typed configuration, preference, and shortcut
  policies plus `useKeyboardShortcuts`.

### Two distinct scales — do not conflate them

- **`renderScale`** (`DEFAULT_RENDER_SCALE = 1.5`): the resolution at which each page canvas is rendered. **Annotation coordinates are stored in this canvas-pixel space.** Export maps them to PDF points via the page's PDF.js `viewport.convertToPdfPoint(...)` (and divides stroke thickness / font size by `scale`).
- **`viewScale`** (zoom, 0.1–2.0): a purely visual CSS transform on displayed pages. It must **not** affect stored coordinates. `getCanvasPoint` in `src/domain/canvasCoordinates.ts` already divides out the display scale via `getBoundingClientRect`, so drawing stays correct at any zoom.

### Lazy rendering and version tokens

Pages render lazily as they approach the viewport using an `IntersectionObserver` (`PAGE_RENDER_ROOT_MARGIN`). Every document load increments a `version` token; async render callbacks check the token and bail if it's stale, so switching PDFs mid-render doesn't paint pages from the old document. `pageViewports` (page → PDF.js viewport) is populated during rendering and consumed by export.

### 200-page cap

Only the first `MAX_ANNOTATABLE_PAGES = 200` pages are rendered and annotatable. On export, pages beyond 200 are preserved **unchanged** — the exporter loads the full original document and only draws onto pages that have annotations, so total page count is never altered.

### Text export constraint

Text is exported with `pdf-lib`'s standard Helvetica font, which has a limited character set. Before writing anything, `exporter.ts` validates every text character against `font.getCharacterSet()` and throws `UnsupportedTextCharacterError` (surfaced to the user) rather than silently corrupting output. Rotated pages are handled by passing the page's `viewport.rotation` to `drawText`. History (commits touching `text-annotations`) shows this validation-on-export path was the resolution to earlier text-export breakage — keep it intact.

### Undo/redo model

The store's undo/redo stacks hold typed entries (`add` / `erase`) rather than snapshots, and a single stack spans both strokes and text so operations undo in true chronological order. Erase records the removed annotation and its original index so undo restores it in place.
