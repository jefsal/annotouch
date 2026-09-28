# Annotouch

Annotouch is a local-first browser app meant for laptops users who want to mark up PDFs without clicking or
pressing down on a trackpad to make annotations. Open a PDF, hold `Space`, move the pointer over a
page, and release `Space` to finish the stroke.

PDF files and annotations stay in the browser. Annotouch does not upload the
document to a server.

## Why

I created Annotouch after realizing that not having a tablet put me at a
disadvantage while taking notes in class. Annotating a PDF with traditional
trackpad movements felt limiting and uncomfortable because of the wrist motion
required for longer note-taking sessions. [osu!](https://github.com/ppy/osu)
inspired the idea of holding a key to draw while using pointer movement for the
stroke.

## Features

- Loads local PDFs without uploading them.
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

Annotouch uses Vite, TypeScript, Preact, Tailwind CSS, PDF.js, and pdf-lib.

```sh
npm ci
npm run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for prerequisites, architecture,
development commands, testing expectations, the AI contribution policy, and
pull request guidance.

## Architecture

Preact owns the UI lifecycle and renders from typed application state. All
application source is TypeScript. Tailwind owns component layout and visual
states; the remaining semantic CSS covers browser-specific rules and DOM
created outside the component tree.

- `src/main.tsx` mounts the application and imports global styles.
- `src/components/App.tsx` owns application state and connects it to the
  document controller, keyboard shortcuts, theme, and preferences.
- `src/components/` also holds the shell, document viewport, settings panel, and
  keyboard-shortcut dialog.
- `src/app/state.ts` defines the typed state, actions, and reducer that drive
  every UI transition.
- `src/app/documentController.ts` owns the PDF lifecycle, lazy page rendering,
  and export; it holds everything that cannot live in serializable state.
- `src/app/` also contains typed configuration, preference, and shortcut
  policies plus the keyboard-shortcut hook.
- `src/domain/` contains shared annotation types, geometry, rendering helpers,
  and application errors.
- `src/annotationStore.ts` owns page annotations and undo/redo history.
- `src/pdfViewer.ts` loads PDFs and renders pages with PDF.js.
- `src/exporter.ts` writes annotations into the exported PDF and is loaded only
  when an export is requested.
- `src/annotator.ts` handles pointer drawing, erasing, and text placement as a
  single exclusive interaction mode, and detaches its listeners on teardown.
- `src/textEditor.ts` owns one text-annotation editing session.
- `src/domain/canvasCoordinates.ts` converts pointer positions into
  canvas-pixel space so stored coordinates stay independent of zoom.
- `src/styles/tailwind.css` holds the design tokens, base layer, named
  breakpoints, and the night-theme token swap.
- `src/style.css` is the small remainder: styling for DOM the component tree
  does not own, plus scrollbar pseudo-elements.
- `tests/unit/` covers typed policies, application state, and domain behavior.
- `tests/e2e/annotouch.spec.js` covers file opening, lazy rendering, drawing,
  text, colors, undo/redo, page limits, themes, and PDF export.

## Contributing

Bug reports, feature proposals, documentation fixes, accessibility work, and
code contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request. Report suspected vulnerabilities privately according to
[SECURITY.md](SECURITY.md).
