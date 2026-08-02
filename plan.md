# Annotouch Refactor Plan

This document is the source of truth for the TypeScript, Preact, and Tailwind
refactor. Update the checkboxes and notes as each slice lands.

## Goals

- Replace loosely coupled global state and DOM mutation with typed application
  state and focused feature boundaries.
- Keep PDF loading, annotation, history, and export behavior stable throughout
  the migration.
- Replace the large legacy stylesheet with a small token layer and
  component-owned Tailwind styles.
- Preserve Annotouch's local-first model: PDFs and annotations remain in the
  browser.
- Finish with a reproducible production deployment through a Cloudflare Tunnel.

## Guardrails

- Refactor incrementally; every commit should leave the app usable.
- Do not change annotation coordinates or conflate render scale with view scale.
- Preserve the 200-page annotation cap and unchanged export of later pages.
- Preserve PDF render version checks so stale asynchronous renders cannot update
  a newly loaded document.
- Preserve unsupported-character validation and rotated-page text export.
- Add or update tests before removing the legacy path they protect.
- Do not mix deployment credentials or environment-specific secrets into Git.

## Current Baseline

- [x] Stabilize the Playwright regression baseline.
- [x] Add TypeScript, ESLint, Prettier, Vitest, and Testing Library.
- [x] Introduce shared domain types, geometry helpers, rendering helpers, and
      typed application errors.
- [x] Migrate the annotation store, PDF viewer, and exporter to TypeScript.
- [x] Render the application shell with Preact.
- [x] Add the Tailwind toolchain and migrate the shell layout.
- [x] Extract typed configuration, preferences, and shortcut policies.
- [x] Lazy-load the PDF export pipeline.
- [x] Document the current architecture and developer workflow in `README.md`.

Current migration boundary:

- All application source is TypeScript. `src/style.css` is down to 148 lines in
  `@layer components`: DOM the component tree does not own (page shells,
  canvases, text editor) plus scrollbar pseudo-elements.

Tailwind traps this migration hit, all verified by pixel comparison:

- Unlayered CSS outranks every `@layer utilities` rule, so leftover stylesheet
  rules silently beat utilities. Moving CSS into a layer inverts that and can
  break rules that relied on winning.
- Conflicting utilities in one family resolve by Tailwind's sort order, not
  class order: base `px-3` beats a caller's `p-0`, `rounded-control` beats
  `rounded-[...]`, and `inline-flex` beats `hidden`. Use one class per family.
- `max-[Npx]:` is exclusive; `max-width: Npx` is inclusive. Named breakpoints
  sit one pixel above the value they reproduce.
- A class placed immediately before `${` in a template literal is dropped by
  the scanner. Use `cx()`.
- `/alpha` mixes in oklab; it is not the same colour as the equivalent `rgba()`.
- Preact emits camelCase SVG attributes verbatim, so `strokeWidth` does
  nothing. Use utilities or lowercase attributes.
- `src/components/App.tsx` deliberately uses `useLayoutEffect` for every side
  effect: Preact defers passive effects to an animation frame, which is too
  late for the `beforeunload` guard, page scaling, and mount-container classes.

## Phase 1: Typed Application State

- [x] Define `AppState`, `AppAction`, and initial-state construction in
      `src/app/state.ts`.
- [x] Model document lifecycle, busy/status state, pen settings, theme, zoom,
      settings visibility, and shortcut-dialog visibility explicitly.
- [x] Add reducer tests for valid state transitions and document replacement.
- [x] Move preference persistence behind typed functions with safe fallbacks.
- [x] Keep PDF bytes, PDF.js objects, canvases, and observers outside serializable
      UI state.
- [x] Wire the reducer into the composition root (landed with the first
      Phase 2 slice, so no imperative DOM sync layer was written twice).

Exit criteria:

- UI state changes flow through typed actions.
- Existing unit and browser tests pass without behavior changes.
- No new untyped global state is added to `src/main.js`.

## Phase 2: Split the Application Controller

- [x] Extract the PDF open/replace lifecycle into a focused document controller.
- [x] Extract lazy page preparation and rendering coordination.
- [x] Extract export coordination and user-facing export errors.
- [x] Move keyboard command wiring into a reusable hook or controller.
- [x] Move toolbar state synchronization into Preact props and callbacks.
- [x] Replace repeated DOM queries and manual attribute/class updates with
      declarative rendering.
- [x] Rename the final entry point from `src/main.js` to `src/main.tsx`.
- [x] Add a browser test for opening a replacement PDF while a render is still
      in progress.

Suggested boundaries:

```text
src/
  app/
    state.ts
    useDocumentController.ts
    useKeyboardShortcuts.ts
  components/
    App.tsx
    AppShell.tsx
    DocumentViewport.tsx
    SettingsPanel.tsx
    ShortcutDialog.tsx
```

Exit criteria:

- `main.tsx` only mounts the application and imports global styles.
- Document loading, rendering, and export retain version-token protection.
- Browser tests cover opening a replacement PDF while work is in progress.

## Phase 3: Migrate Annotation Interaction

- [x] Convert `src/annotator.js` to TypeScript.
- [x] Define typed interaction modes for idle, drawing, erasing, and text entry.
- [x] Isolate pointer-to-canvas coordinate conversion and test it across zoom
      levels.
- [x] Give all document-level listeners explicit setup and teardown lifecycles.
- [x] Move text-editor lifecycle into a focused component or controller.
- [x] Preserve chronological undo/redo across strokes and text annotations.
- [x] Add unit tests for interaction transitions and cancellation on blur,
      visibility change, and `Escape`.

Exit criteria:

- No JavaScript source remains under `src/`.
- Drawing, erasing, text entry, zoom, and history pass browser regression tests.
- No event listener survives component/controller teardown.

## Phase 4: Untangle CSS

- [x] Inventory `src/style.css` by shell, controls, PDF viewport, annotation,
      text editor, dialog, responsive, and theme responsibilities.
- [x] Move repeated colors, spacing, shadows, and sizing into named design
      tokens.
- [x] Split the Preact shell into smaller components before moving their styles.
- [ ] Migrate component layout and visual states to Tailwind utilities.
  - [x] Settings button and panel, including narrow viewport states.
  - [x] Shortcut dialog layout, night palette, and responsive states; browser
        scrollbar and `::backdrop` rules remain in semantic CSS.
  - [x] Responsive toolbar states.
  - [x] Document viewport and page-shell states.
- [x] Keep canvas, PDF page, text editor, and browser-specific rules in small
      semantic CSS layers where utilities would reduce clarity.
- [x] Replace imperative theme classes with a single documented theme boundary.
- [x] Delete legacy selectors as soon as their replacements have browser
      coverage.
- [x] Verify narrow viewport, focus-visible, hover, disabled, busy, and night
      theme states.

Phase 4 is complete. `src/style.css` finished at 148 lines inside
`@layer components`, holding only:

- the shortcut dialog's top-layer backdrop and `::-webkit-scrollbar` rules,
- the drag-highlight descendant rules that reach imperative page shells,
- page shells, loading placeholders, both canvases, and the textarea editor,
  all of which are created by the document controller rather than the
  component tree,
- `.is-text-mode .annotation-canvas`, the one rule that still needs a class on
  the mount container.

Exit criteria:

- `src/style.css` is removed or reduced to documented browser/canvas primitives.
- Components own their layout and state styling.
- There are no unused selectors or duplicated design values.

## Phase 5: Hardening and Performance

- [ ] Add focused component tests for the shell, dialogs, settings, and document
      states. Only `AppShell` has coverage today; `App`, `DocumentViewport`,
      `SettingsPanel`, and `ShortcutDialog` have none. `App` needs a fake
      document controller, since the real one loads PDF.js.
- [ ] Test malformed, encrypted, empty, rotated, and over-200-page PDFs.
      Rotated (90/180/270) and 205-page are already covered in the browser
      suite; malformed, encrypted, and zero-page are not. All three should end
      on the `could not load PDF` status with the previous document discarded.
- [ ] Verify keyboard-only operation and accessible names, focus order, and
      dialog focus restoration. Partly covered: the focus ring is asserted per
      control, and the shortcut dialog already restores focus to the settings
      button. Missing: a full Tab-order walk of the toolbar, and confirmation
      that the modal traps focus.
- [ ] Confirm export remains lazy-loaded and review production chunk sizes.
      Current build: `index` ~422 kB (127 kB gzip), `exporter` ~433 kB
      (179 kB gzip, still a separate chunk), `pdf.worker` ~2.2 MB. The worker
      is the obvious target if size matters.
- [ ] Profile large-document scrolling and verify canvases are not rendered
      outside `PAGE_RENDER_ROOT_MARGIN`. The 200-page fixture is the workload;
      assert rendered-page count stays bounded while scrolling.
- [ ] Run `npm audit` and resolve actionable production issues.

Exit criteria:

- Typecheck, lint, formatting, unit tests, browser tests, and production build
  all pass.
- No critical accessibility or data-loss regression remains.

## Phase 6: Cloudflare Tunnel Deployment

**Blocked until these are answered.** None of them can be derived from the
repository, and the first three change the shape of the work:

1. Oracle host: address, SSH user, and which key. Is it arm64 (Ampere) or x86?
2. Public hostname, and the Cloudflare zone it belongs to. Is that zone already
   on the account whose credentials we will use?
3. Does anything already serve HTTP on the host (Caddy, Nginx, another tunnel)?
   If so, we extend it rather than installing a second server.
4. Is `cloudflared` already installed, and does a named tunnel already exist?
5. Build on the host (`git pull && npm ci && npm run build`) or build locally
   and ship `dist/` (rsync)? Building on the host needs Node and enough RAM;
   shipping `dist/` needs no toolchain there.
6. Is systemd available for supervising the static server and `cloudflared`?
7. How many previous releases should stay on disk for rollback?

Secrets stay out of Git: tunnel credentials and any API token live only on the
host, referenced by path.

- [ ] Confirm the Oracle host, SSH access, target hostname, and Cloudflare zone.
- [ ] Decide whether the static `dist/` output will be served by Caddy, Nginx, or
      another existing service on the host.
- [ ] Produce the release with `npm ci` and `npm run build`.
- [ ] Copy or pull only the required production artifact and server
      configuration onto the Oracle host.
- [ ] Configure a named Cloudflare Tunnel and DNS route for the chosen hostname.
- [ ] Run the static server and `cloudflared` as supervised services.
- [ ] Verify HTTPS, cache behavior, SPA fallback behavior, security headers, and
      public PDF annotation/export from the deployed URL.
- [ ] Document deploy, health-check, log, restart, and rollback commands without
      committing credentials.

Exit criteria:

- The public hostname serves the production build over HTTPS.
- The tunnel and web server recover after a host reboot.
- A previous known-good build can be restored without rebuilding.

## Required Checks

Run these before completing each behavior-changing phase:

```sh
npm run typecheck
npm run lint
npm run test
npm run format:check
npm run build
npm run test:e2e
```

For a documentation-only change, formatting and diff validation are sufficient.

## Definition of Done

- All application source is TypeScript/TSX.
- Preact owns the UI lifecycle and state rendering.
- Feature boundaries replace the monolithic controller.
- Styling has clear ownership and minimal global CSS.
- Existing annotation and PDF invariants have automated regression coverage.
- The README and this plan reflect the shipped architecture.
- The production build is accessible through the configured Cloudflare Tunnel.

## Resuming on Another Machine

The branch `jefsal/typescript-preact-refactor` carries all committed work.

```sh
git clone git@github.com:jefsal/annotouch.git
cd annotouch && git checkout jefsal/typescript-preact-refactor
npm ci
npx playwright install chromium
```

`CLAUDE.md` and this file are git-ignored, so they do not travel with the
clone. Copy them across by hand, or they will be missing on the new machine.

### The visual review harness does not travel either

Phase 4 was verified by pixel comparison against the last commit before any
stylesheet migration, not by reading diffs. It caught six defects that the
browser suite passed clean on, so it is worth rebuilding before touching
styling again. It lived outside the repository, in `node_modules/.review-tools`
and a scratch directory.

What it did:

1. A git worktree at **`c2bd9ee`** — the last commit before the stylesheet was
   migrated — served on one port as ground truth, and the working tree on
   another.
2. A capture script visiting both, at every media-query boundary and one pixel
   either side (1280, 800, 721/720/719, 600, 561/560/559, 540, 481/480/479,
   421/420/419, 361/360/359, 320), in both themes, in four states: empty,
   document loaded, settings open, shortcut dialog open. 160 screenshots each.
3. A Pillow comparison reporting per-file differing pixel counts and bounding
   boxes. The standard held was zero differing pixels for light mode.
4. Property-level probes for anything screenshots cannot see: computed styles
   at breakpoint boundaries, and hover / focus-visible / disabled states, which
   is how the missing focus ring surfaced.

Screenshots capture idle state only. Anything behind a preference, a hover, or
a transition needs an explicit probe: the undo/redo visibility bug survived the
sweep because those controls are hidden by default.
