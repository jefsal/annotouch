# Contributing to Annotouch

Thank you for helping make Annotouch better. Contributions can include bug
fixes, features, accessibility improvements, tests, documentation, and design
feedback.

Annotouch is a local-first browser application for annotating PDFs with
keyboard-and-pointer interactions. PDF contents and annotations stay in the
browser; changes MUST preserve that privacy model.

## Table of Contents

- [Before You Start](#before-you-start)
- [AI-Assisted Contributions](#ai-assisted-contributions)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Implementation Guidelines](#implementation-guidelines)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs and Requesting Features](#reporting-bugs-and-requesting-features)
- [Community Expectations](#community-expectations)
- [Getting Help](#getting-help)

## Before You Start

Search the [existing issues](https://github.com/jefsal/annotouch/issues) before
opening a new one or starting substantial work.

- Small fixes and documentation improvements can go directly to a pull
  request.
- For a feature, significant interface change, or architectural change, open an
  issue first so its scope and user experience can be agreed on before
  implementation.
- Do not open a public issue for a suspected security vulnerability. Follow the
  private reporting process in [SECURITY.md](SECURITY.md).

## AI-Assisted Contributions

AI tools are welcome when they help you make a thoughtful, well-tested
contribution. The same review standard applies whether or not AI was used.

1. **Own your contribution.** Read, understand, and be able to explain every
   change you submit.
2. **Disclose significant AI use.** In the pull request description, name the
   tool and briefly describe how it was used when it generated or materially
   shaped code, tests, documentation, or design work. Routine completion,
   spelling, and formatting assistance do not need disclosure.
3. **Solve a real, scoped problem.** Do not submit speculative rewrites,
   fabricated bug reports, or drive-by generated refactors with no demonstrated
   user or maintenance benefit.
4. **Verify the result yourself.** Never claim that a check ran or a behavior
   was observed unless you personally verified it. Include the commands and
   results in the pull request.
5. **Protect private data.** Do not send PDFs, credentials, private issue
   content, or other sensitive material to an AI service unless you have the
   right to do so and the service is approved for that data.

Maintainers may ask for an explanation, focused tests, or a smaller change when
a submission is difficult to review. Low-quality automated submissions may be
closed.

## Development Setup

### Prerequisites

- Git
- Node.js 22.13 or newer in the 22.x line, or Node.js 24 or newer (the
  current LTS release is recommended)
- npm, which is bundled with Node.js
- Chromium for the end-to-end suite

The project uses npm and commits `package-lock.json`. Please do not replace the
lockfile with one from another package manager.

### Quick Start

1. Fork the repository and clone your fork:

   ```sh
   git clone git@github.com:YOUR_USERNAME/annotouch.git
   cd annotouch
   ```

2. Install the exact dependency versions from the lockfile:

   ```sh
   npm ci
   ```

3. Start the development server:

   ```sh
   npm run dev
   ```

4. Open the URL printed by Vite and load a local PDF.

To run browser tests, install Chromium once:

```sh
npx playwright install chromium
```

On Linux, use `npx playwright install --with-deps chromium` if the required
system libraries are not already installed.

## Project Structure

```text
annotouch/
├── public/                  # Static images and favicons
├── src/
│   ├── app/                 # State, preferences, shortcuts, and PDF lifecycle
│   ├── components/          # Preact interface components
│   ├── domain/              # Types, geometry, rendering, and typed errors
│   ├── styles/              # Tailwind tokens and global design layers
│   ├── annotationStore.ts   # Per-page annotations and undo/redo history
│   ├── annotator.ts         # Drawing, erasing, and text interaction modes
│   ├── exporter.ts          # Lazy-loaded PDF export pipeline
│   ├── pdfViewer.ts         # PDF.js loading and page rendering
│   └── textEditor.ts        # Text-annotation editing sessions
├── tests/
│   ├── unit/                # Vitest and Testing Library tests
│   └── e2e/                 # Playwright user-workflow tests
├── index.html               # Vite entry document
├── playwright.config.js     # Browser-test configuration
└── vite.config.ts           # Vite, Preact, Tailwind, and Vitest configuration
```

The [README](README.md#architecture) gives a more detailed architectural
overview. `CLAUDE.md` records low-level invariants for coding agents and is also
useful background for complex changes.

## Development Workflow

1. Create a focused branch from the latest `main`:

   ```sh
   git switch main
   git pull --ff-only
   git switch -c fix/short-description
   ```

2. Make one coherent change. Avoid unrelated formatting or refactoring.
3. Add or update tests for behavior changes.
4. Run the checks appropriate to the change.
5. Commit with a short, imperative summary, then push your branch and open a
   pull request.

Branch names such as `fix/export-rotation`, `feat/keyboard-shortcut`, and
`docs/contributing-guide` are encouraged. Clean, readable
history matters more than a rigid naming scheme.

## Implementation Guidelines

### General

- Keep TypeScript strict. Prefer precise types and narrow unknown data.
- Let Prettier and ESLint define formatting and static-analysis rules. Run the
  tools instead of hand-formatting around them.
- Keep UI rendering declarative in Preact. State transitions belong in the
  typed application state; PDF.js objects, canvases, observers, and raw PDF
  bytes stay outside serializable state.
- Put component layout and state styling in Tailwind utilities. Reserve semantic
  CSS for browser pseudo-elements and controller-created DOM where utilities
  reduce clarity.
- Keep keyboard shortcuts disabled in editable controls, and update the shortcut
  policy, shortcut dialog, and tests together.

### Privacy and Document Safety

- PDF data and annotations must stay on the user's device. Do not add uploads,
  analytics containing document data, or a network dependency in the document
  path without prior maintainer agreement and explicit user consent.
- Never modify the source PDF. Export writes a new downloaded copy.
- Preserve the original page count on export. Only the first 200 pages are
  currently rendered and annotatable; later pages pass through unchanged.

### Coordinates and Asynchronous Work

- Annotation coordinates are stored in canvas-pixel space and must remain
  independent of display zoom. Use the helpers in
  `src/domain/canvasCoordinates.ts`.
- Preserve document-version checks around asynchronous loading, rendering, and
  export so stale work cannot update a replacement document.
- Snapshot export inputs before the first asynchronous boundary.
- Preserve page rotation and unsupported-text validation during export.

## Testing

Use the narrowest useful command while developing:

```sh
npm run test:watch
npm run test -- tests/unit/geometry.test.ts
npx playwright test tests/e2e/annotouch.spec.js -g "export"
```

Before submitting most code changes, run:

```sh
npm run typecheck
npm run lint
npm run test
npm run format:check
npm run build
```

Run the complete browser suite when a change affects interaction, keyboard or
focus behavior, PDF loading/rendering/export, responsive layout, or a critical
user workflow:

```sh
npm run test:e2e
```

Documentation-only changes generally need `npm run format:check` plus a review
of rendered Markdown. In the pull request, list every command you ran and note
any check you could not run.

Tests should cover the user-visible outcome and the regression that motivated
the change. Keep coverage for malformed or empty PDFs, document replacement,
rotated pages, documents over 200 pages, keyboard access, and export behavior.

## Submitting a Pull Request

A reviewable pull request should:

- explain the problem and why the chosen change solves it;
- stay focused on one issue or outcome;
- link an issue with `Closes #123` when applicable;
- include tests for changed behavior;
- include before-and-after screenshots or a recording for visible UI changes;
- identify privacy, accessibility, performance, or compatibility effects;
- disclose significant AI assistance as described above; and
- list the verification commands that actually passed.

## Reporting Bugs and Requesting Features

Use the repository's issue forms:

- [Report a bug](https://github.com/jefsal/annotouch/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/jefsal/annotouch/issues/new?template=feature_request.yml)

Bug reports should include a minimal reproduction, expected and actual
behavior, browser and operating-system details, and a sample PDF only when it
is safe to share publicly.

Feature requests should explain the user problem before proposing an
implementation. Accessibility and keyboard-only workflows are first-class use
cases for Annotouch.

## Community Expectations

Be respectful, patient, and specific. Discuss the work rather than the person;
welcome questions; and give actionable feedback. Harassment, discrimination,
personal attacks, and disclosure of another person's private information are
not acceptable.

Do not post sensitive conduct-report details in a public issue. The repository
owner should publish a private enforcement contact before adopting a formal
code of conduct.

## Getting Help

Search the [README](README.md) and
[existing issues](https://github.com/jefsal/annotouch/issues) first. If the
answer is not there, open a focused issue with the `question` label and include
what you have already tried.

Thank you for contributing to Annotouch.
