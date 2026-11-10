/*
 * The embedded editor takes the wheel and keyboard as soon as the pointer or
 * focus is inside it, which would trap visitors scrolling past the demo. A
 * shield covers it until they choose to try it, then hands focus straight to
 * the editor so Space draws instead of scrolling the landing page.
 */
const frame = document.querySelector<HTMLIFrameElement>("[data-demo-frame]");
const shield = document.querySelector<HTMLButtonElement>("[data-demo-shield]");

if (frame && shield) {
  shield.addEventListener(
    "click",
    () => {
      shield.remove();
      frame.focus();
      frame.contentWindow?.focus();
    },
    { once: true }
  );
}

/*
 * The header gets out of the way while reading down the page and returns as
 * soon as the visitor scrolls back up, reaches the top, or tabs into it.
 */
const header = document.querySelector<HTMLElement>("[data-site-header]");
const SCROLL_JITTER = 4;

if (header) {
  let lastY = window.scrollY;
  let pending = 0;

  const update = (): void => {
    pending = 0;
    const y = window.scrollY;
    const delta = y - lastY;
    if (Math.abs(delta) < SCROLL_JITTER) return;

    const shouldHide =
      delta > 0 &&
      y > header.offsetHeight &&
      !header.contains(document.activeElement);
    header.toggleAttribute("data-hidden", shouldHide);
    lastY = y;
  };

  window.addEventListener(
    "scroll",
    () => {
      pending ||= window.requestAnimationFrame(update);
    },
    { passive: true }
  );
  header.addEventListener("focusin", () => {
    header.removeAttribute("data-hidden");
  });
}
