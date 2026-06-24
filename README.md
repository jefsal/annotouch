# Annotouch

Annotouch is an browser app for marking up local PDFs without clicking or pressing a trackpad. Open a PDF, hold `Space`, move the pointer over a page, and release `Space` to finish the stroke.

## Current MVP

- Loads a local PDF in the browser.
- Renders up to the first 25 pages.
- Adds a transparent drawing layer over each rendered page.
- Stores strokes by page.
- Supports undo, clear, and PDF export.
- Keeps pages beyond the first 25 unchanged when exporting.

## Not Included Yet

- Zoom or pan
- Eraser or stroke editing
- Text comments
- Accounts, cloud storage, or collaboration

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

## Project Structure

- `src/main.js` wires the UI, PDF loading, rendering, and export flow.
- `src/pdfViewer.js` handles PDF.js document loading and page rendering.
- `src/annotator.js` handles `Space` plus pointer-movement drawing.
- `src/strokeStore.js` stores and redraws page-specific strokes.
- `src/exporter.js` writes annotations back into the exported PDF.

## Why

I created this app because while taking notes in class I realized not having a
tablet to take notes on put me at a disadvantage when trying to learn.
Annotating a pdf for in class work using traditional trackpad movements felt limiting.
[Osu](https://github.com/ppy/osu) inspired this solution by using a keystroke to 'click' then moving the cursor to create a 'stroke.'
