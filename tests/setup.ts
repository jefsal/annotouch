import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/preact";
import { afterEach } from "vitest";

installDialogPolyfill();

afterEach(() => {
  cleanup();
});

/**
 * jsdom 29 exposes `HTMLDialogElement` and reflects the `open` attribute, but
 * implements neither `showModal()` nor `close()`. `ShortcutDialog` calls both,
 * so without this any test that opens the dialog throws.
 *
 * This models only what the component can observe: the `open` attribute and the
 * `close` event. Top-layer placement, the focus trap, `::backdrop`, and
 * Escape-to-dismiss are browser behavior with no jsdom equivalent, and stay
 * covered by the Playwright suite.
 */
function installDialogPolyfill(): void {
  const prototype: Partial<HTMLDialogElement> = HTMLDialogElement.prototype;

  if (typeof prototype.showModal !== "function") {
    prototype.showModal = function showModal(this: HTMLDialogElement): void {
      this.setAttribute("open", "");
    };
  }

  if (typeof prototype.show !== "function") {
    prototype.show = function show(this: HTMLDialogElement): void {
      this.setAttribute("open", "");
    };
  }

  if (typeof prototype.close !== "function") {
    prototype.close = function close(
      this: HTMLDialogElement,
      returnValue?: string
    ): void {
      if (!this.hasAttribute("open")) return;

      this.removeAttribute("open");

      if (returnValue !== undefined) {
        this.returnValue = returnValue;
      }

      this.dispatchEvent(new Event("close"));
    };
  }
}
