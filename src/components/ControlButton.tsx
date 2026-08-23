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
 * sizing, and inline padding; they never restate the border, focus ring, or
 * disabled treatment. The base sets `p-0` rather than `px-3` because Tailwind
 * sorts `p-*` before `px-*`: a base `px-3` would beat a caller's `p-0`, while
 * `p-0` correctly yields to a caller's `px-3`.
 */
const BASE =
  "inline-flex h-9 cursor-pointer items-center justify-center whitespace-nowrap " +
  "rounded-control border p-0 text-text-primary " +
  `${FOCUS_RING} ` +
  "disabled:cursor-not-allowed";

const VARIANTS: Record<ControlButtonVariant, string> = {
  default:
    "border-border-default bg-surface shadow-control " +
    "enabled:hover:border-border-strong enabled:hover:bg-surface-muted " +
    "disabled:opacity-[0.48]",
  accent:
    "border-action bg-action text-white font-[650] shadow-control " +
    "enabled:hover:border-action-hover enabled:hover:bg-action-hover " +
    "disabled:border-border-default disabled:bg-surface-muted " +
    "disabled:text-text-secondary disabled:shadow-none",
  // For controls sitting on the frosted toolbar: no fill and no outline of
  // their own, so the toolbar's blurred backdrop reads straight through. Hover
  // tints rather than filling, which would put the opaque slab back. The border
  // is transparent rather than zero-width so the box keeps the same geometry as
  // the other variants. A caller cannot get either by adding `bg-transparent` /
  // `border-0` to the `default` variant — competing utilities in one family
  // resolve by Tailwind's sort order, not by class order.
  glass:
    "border-transparent bg-transparent enabled:hover:bg-surface/45 " +
    "disabled:opacity-[0.48]",
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
