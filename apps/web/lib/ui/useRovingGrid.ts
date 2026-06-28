"use client";

/**
 * `useRovingGrid` — roving-focus keyboard navigation for a grid of cells
 * (the realm picker). Arrow keys move a single "selected" focus across
 * enabled cells (skipping sealed/disabled ones), Home/End jump to the first
 * and last enabled cell, and the cell's own native `<button>`/`<Link>` Enter
 * activates it.
 *
 * It does NOT own activation — the native element does — but the container's
 * `onKeyDownCapture` swallows Enter when the shared activation gate is
 * disarmed or on autorepeat, so a held Enter from a prior screen can't fire a
 * card the instant the grid mounts.
 *
 * `getCellProps(i)` returns the roving `tabIndex` and a `ref` so the hook can
 * move focus; `isEnabled(i)` reports which cells participate.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useActivationArmed, isActivationKeyHeld } from "./activation-gate";

type CellProps = {
  ref: (el: HTMLElement | null) => void;
  tabIndex: number;
};

function firstEnabled(count: number, isEnabled: (i: number) => boolean): number {
  for (let i = 0; i < count; i++) if (isEnabled(i)) return i;
  return 0;
}

function lastEnabled(count: number, isEnabled: (i: number) => boolean): number {
  for (let i = count - 1; i >= 0; i--) if (isEnabled(i)) return i;
  return Math.max(0, count - 1);
}

export function useRovingGrid({
  count,
  isEnabled,
  columns = 3,
  autoFocusFirst = true,
  sig,
}: {
  count: number;
  isEnabled: (i: number) => boolean;
  columns?: number;
  autoFocusFirst?: boolean;
  /** Re-arms the activation gate when the cell set changes. */
  sig?: string;
}): {
  containerProps: {
    onKeyDownCapture: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  };
  getCellProps: (i: number) => CellProps;
} {
  const armed = useActivationArmed(sig);
  const refs = useRef<(HTMLElement | null)[]>([]);

  // Read the latest enabled predicate at event time (its identity changes each
  // render since callers pass an inline arrow).
  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;

  const [selected, setSelected] = useState(() =>
    firstEnabled(count, isEnabled),
  );

  // Keep selection valid when the cell set changes.
  useEffect(() => {
    setSelected((cur) =>
      cur < count && isEnabledRef.current(cur)
        ? cur
        : firstEnabled(count, isEnabledRef.current),
    );
  }, [count, sig]);

  // Auto-focus the first enabled cell on mount (the "highlight the first
  // available realm" beat) — but not if an activation key is currently held
  // (we'd be stealing focus mid-cascade).
  const didAutoFocus = useRef(false);
  useEffect(() => {
    if (!autoFocusFirst || didAutoFocus.current) return;
    if (typeof window === "undefined") return;
    if (isActivationKeyHeld()) return;
    didAutoFocus.current = true;
    const el = refs.current[firstEnabled(count, isEnabledRef.current)];
    if (el && document.activeElement !== el) el.focus({ preventScroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move focus to the selected cell whenever it changes via keyboard.
  useEffect(() => {
    const el = refs.current[selected];
    if (!el) return;
    if (document.activeElement === el) return;
    // Only follow focus if focus is already within the grid, so we don't
    // yank it away from elsewhere on the page on an unrelated re-render.
    const active = document.activeElement;
    const withinGrid = refs.current.some((r) => r && r === active);
    if (!withinGrid && didAutoFocus.current) return;
    el.focus({ preventScroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /** Find the next enabled index from `from` stepping by `delta`, within
   *  bounds (no wrap). Returns `from` if none found. */
  const seek = useCallback((from: number, delta: number): number => {
    let i = from + delta;
    while (i >= 0 && i < count) {
      if (isEnabledRef.current(i)) return i;
      i += delta;
    }
    return from;
  }, [count]);

  const onKeyDownCapture = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (count === 0) return;

      if (e.key === "Enter") {
        // Native button/link would fire on autorepeat or a held-from-prior
        // screen Enter; swallow it unless this is a fresh, armed press.
        if (e.repeat || !armed) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setSelected((cur) => seek(cur, 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setSelected((cur) => seek(cur, -1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelected((cur) => seek(cur, columns));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelected((cur) => seek(cur, -columns));
          break;
        case "Home":
          e.preventDefault();
          setSelected(firstEnabled(count, isEnabledRef.current));
          break;
        case "End":
          e.preventDefault();
          setSelected(lastEnabled(count, isEnabledRef.current));
          break;
        default:
          break;
      }
    },
    [armed, count, columns, seek],
  );

  const getCellProps = useCallback(
    (i: number): CellProps => ({
      ref: (el: HTMLElement | null) => {
        refs.current[i] = el;
      },
      tabIndex: i === selected ? 0 : -1,
    }),
    [selected],
  );

  return { containerProps: { onKeyDownCapture }, getCellProps };
}
