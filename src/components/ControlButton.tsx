import type { JSX } from "preact";
import { cx, FOCUS_RING } from "./classNames";

type NativeButtonProps = Omit<JSX.IntrinsicElements["button"], "class">;

export type ControlButtonVariant = "default" | "accent";

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
