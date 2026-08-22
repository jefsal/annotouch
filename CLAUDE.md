# CLAUDE.md

Repository guidance for coding agents working on Annotouch. Keep this file
factual, durable, and free of credentials or machine-specific details.

## Current State

Annotouch is a local-first PDF annotation app built with Preact, TypeScript,
Tailwind CSS, Vite, PDF.js, and pdf-lib. The TypeScript/Preact/Tailwind refactor
is complete: Preact owns the interface, application state is typed, and
`src/style.css` intentionally holds browser rules and DOM primitives that
components do not create.

PDF bytes and annotations remain in the browser. The app has no upload service.

`plan.md` records the completed refactor and an older Cloudflare deployment
plan. Treat it as historical context, not an active task list. Confirm the
current deployment state and requirements with the user before changing any
infrastructure.

## Commands

```sh
npm run dev            # start the Vite development server
npm run build          # build production assets in dist/
npm run preview        # serve the production build

npm run typecheck      # TypeScript validation
npm run lint           # ESLint
npm run test           # Vitest unit tests
npm run format:check   # Prettier validation

npx playwright install chromium   # one-time browser installation
npm run test:e2e                   # Playwright suite; starts the dev server
npm run test:e2e:headed            # Playwright with a visible browser
```

Run one browser test by title:

```sh
npx playwright test tests/e2e/annotouch.spec.js -g "export"
```

Do not commit generated `dist/`, `playwright-report/`, `test-results/`, or
machine-local files.

## Architecture

- `src/main.tsx` mounts the application and imports the global style layers.
- `src/components/App.tsx` owns `AppState`, preferences, application shortcuts,
  unsaved-work protection, and the document-controller boundary.
- `src/components/` renders the shell, document viewport, settings, and
  shortcut dialog from state and callbacks.
- `src/app/documentController.ts` owns PDF bytes, PDF.js objects, page shells,
  canvases, lazy rendering, annotation coordination, and export orchestration.
- `src/annotationStore.ts`, `src/annotator.ts`, and `src/textEditor.ts` own
  annotation history, pointer interaction, and text-editing sessions.
- `src/pdfViewer.ts` wraps PDF.js rendering. `src/exporter.ts` is lazy-loaded
  and writes annotations into a downloaded copy with pdf-lib.
- `src/domain/` contains annotation types, geometry, canvas mapping, rendering
  helpers, and typed errors.
- `src/styles/tailwind.css` owns tokens, themes, and component styling;
  `src/style.css` owns browser pseudo-elements and controller-created DOM.

## Behavioral Invariants

### Coordinates and zoom

`renderScale` controls canvas backing resolution and defaults to `1.5`.
Annotation coordinates are stored in that canvas-pixel space.

`viewScale` ranges from `0.1` to `2.0` and changes displayed page-shell
dimensions only. It must never rewrite stored coordinates. Use
`getCanvasPoint()` and `getCanvasDisplayScale()` from
`src/domain/canvasCoordinates.ts`; both account for the ratio between the
displayed canvas and its backing store.

### Document lifecycle

Every document load increments a version token. Any asynchronous load, render,
or export continuation must verify that token before publishing state. Keep PDF
bytes, PDF.js objects, canvases, observers, and page viewports outside
serializable `AppState`.

Export snapshots its inputs before its first `await`, because a replacement PDF
may open while the exporter is loading. Do not let a stale operation update the
replacement document's status.

### Rendering and page limits

Only the first `MAX_ANNOTATABLE_PAGES = 200` pages are rendered and annotatable.
Export must retain the original total page count and leave later pages
unchanged.

Page canvases render lazily within `PAGE_RENDER_ROOT_MARGIN`. Rendering is
currently monotonic: once rendered, a canvas remains mounted. Do not introduce
eager rendering or remove the version checks.

### Annotation and export behavior

The annotation store keeps one ordered array of stroke and text annotations per
page. Undo and redo span both types chronologically; erasure records original
indices so undo restores ordering.

Text export uses pdf-lib's standard Helvetica font. Validate characters before
writing and surface `UnsupportedTextCharacterError` instead of corrupting
output. Preserve page rotation when exporting text and preserve the PDF.js
viewport conversion used for all annotation coordinates.

PDF replacement must retain the discard confirmation when unsaved annotations
or a text draft exist. Malformed, encrypted, truncated, and zero-page PDFs must
return the app to a usable empty state.

## Implementation Conventions

- `App.tsx`, `ShortcutDialog.tsx`, and `useKeyboardShortcuts.ts` deliberately
  use `useLayoutEffect` where the next user action or page unload must observe
  the side effect immediately. Do not replace these with passive effects
  without proving the timing remains safe.
- Keep document-level listeners paired with explicit teardown. The annotator
  and document controller must release listeners, observers, PDF.js objects,
  and editing sessions from `destroy()` or `close()`.
- Put declarative component layout and state styling in Tailwind utilities. Use
  semantic CSS only for pseudo-elements or controller-created DOM where it is
  clearer.
- Use `cx()` for conditional utilities. Avoid conflicting utilities from the
  same family; Tailwind resolves them by generated order, not class-string
  order.
- Preact may emit camelCase SVG attributes verbatim. Prefer utilities or valid
  lowercase SVG attributes for stroke and presentation properties.
- Keep shortcuts disabled inside editable controls. Update
  `src/app/shortcuts.ts`, the shortcut dialog, and tests together when adding or
  changing a command.

## Verification

Add focused unit coverage for domain or component behavior and browser coverage
for user workflows, keyboard order, focus, rendering, or export changes. Keep
malformed-document, replacement-during-work, rotated-page, and over-200-page
regressions intact.

Before handing off a code change, run the checks proportional to its scope. For
a release or broad refactor, run typecheck, lint, unit tests, formatting, the
production build, and the complete Playwright suite.
