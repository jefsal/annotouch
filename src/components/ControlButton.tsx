import type { JSX } from "preact";
import { cx, FOCUS_RING } from "./classNames";

type NativeButtonProps = Omit<JSX.IntrinsicElements["button"], "class">;

export type ControlButtonVariant = "default" | "accent" | "glass";

export interface ControlButtonProps extends NativeButtonProps {
  variant?: ControlButtonVariant;
  class?: string;
}

/**
 * The shared look for every button in the application. Callers add layout,
 * sizing, and inline padding; they never restate the elevation, focus ring, or
 * disabled treatment. The base sets `p-0` rather than `px-3` because Tailwind
 * sorts `p-*` before `px-*`: a base `px-3` would beat a caller's `p-0`, while
 * `p-0` correctly yields to a caller's `px-3`.
 *
 * Buttons carry no outline of their own. A filled button is separated from the
 * surface behind it by a shadow instead, so the chrome reads as raised rather
 * than drawn.
 */
const BASE =
  "inline-flex h-9 cursor-pointer items-center justify-center whitespace-nowrap " +
  "rounded-control border-none p-0 text-text-primary " +
  `${FOCUS_RING} ` +
  "disabled:cursor-not-allowed";

const VARIANTS: Record<ControlButtonVariant, string> = {
  default:
    "bg-surface shadow-(--shadow-control) " +
    "enabled:hover:bg-surface-muted " +
    "enabled:hover:shadow-(--shadow-control-raised) " +
    "disabled:opacity-[0.48]",
  accent:
    "bg-action text-white font-[650] shadow-(--shadow-control) " +
    "enabled:hover:bg-action-hover " +
    "enabled:hover:shadow-(--shadow-control-raised) " +
    "disabled:bg-surface-muted disabled:text-text-secondary " +
    "disabled:shadow-none",
  // For controls sitting on the frosted toolbar: no fill and no elevation of
  // their own, so the toolbar's blurred backdrop reads straight through. Hover
  // tints rather than filling, which would put the opaque slab back. A caller
  // cannot get this by adding `bg-transparent` to the `default` variant —
  // competing utilities in one family resolve by Tailwind's sort order, not by
  // class order.
  glass: "bg-transparent enabled:hover:bg-surface/45 disabled:opacity-[0.48]",
};

export function ControlButton({
  variant = "default",
  class: extraClass,
  type = "button",
  ...props
}: ControlButtonProps) {
  return (
    <button
      type={type}
      class={cx(BASE, VARIANTS[variant], extraClass)}
      {...props}
    />
  );
}
