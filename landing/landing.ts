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
