import { flushSync } from "react-dom";
export function withViewTransition(updateFn: () => void): void {
  const supportsViewTransition =
    typeof document !== "undefined" &&
    typeof (document as any).startViewTransition === "function";

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (!supportsViewTransition || prefersReducedMotion) {
    updateFn();
    return;
  }

  (document as any).startViewTransition(() => {
    flushSync(updateFn);
  });
}