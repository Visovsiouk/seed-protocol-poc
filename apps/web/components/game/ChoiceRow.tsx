"use client";

/**
 * Shared keyboard-navigable choice row.
 *
 * Renders a row of choice elements (either `<button>` or `<Link>`) with
 * roving focus: ArrowLeft/Right/Up/Down move the selection, Home/End
 * jump to the ends, and Enter/Space activate the focused choice.
 *
 * Activation is handled explicitly (not via native button keydown→click)
 * so we can gate it across context changes:
 *
 *   - Key autorepeat (`event.repeat === true`) is always ignored — one
 *     keydown = at most one activation. Holding Enter doesn't spam.
 *   - When the choice set changes (sig changes) while Enter is held,
 *     the next ChoiceRow mounts "disarmed" and refuses to activate
 *     until the user physically releases Enter and presses again. This
 *     prevents accidentally minting (or restarting, or warping) when
 *     a held Enter happens to land on the new prompt.
 *
 * The "is Enter currently held" signal is tracked at module scope via
 * window listeners installed lazily on first mount, so every ChoiceRow
 * instance (including the one that just mounted) shares one source of
 * truth.
 */

import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// --- Activation gate ----------------------------------------------------

// Module-level state: is Enter or Space currently physically held?
// Set on keydown (capture), cleared on keyup. Shared so a ChoiceRow that
// just mounted can ask "was Enter already down when I appeared?".
let activationKeyHeld = false;
let releaseListeners = new Set<() => void>();
let listenersInstalled = false;

function ensureGlobalListeners() {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  const isActivationKey = (e: KeyboardEvent) =>
    e.key === "Enter" || e.key === " " || e.code === "Space";
  window.addEventListener(
    "keydown",
    (e) => {
      if (isActivationKey(e)) activationKeyHeld = true;
    },
    true,
  );
  window.addEventListener(
    "keyup",
    (e) => {
      if (isActivationKey(e)) {
        activationKeyHeld = false;
        // Notify any disarmed rows so they can re-arm.
        for (const cb of releaseListeners) cb();
      }
    },
    true,
  );
  // Also clear when the window loses focus (alt-tab while holding key).
  window.addEventListener("blur", () => {
    activationKeyHeld = false;
    for (const cb of releaseListeners) cb();
  });
}

// --- Public types -------------------------------------------------------

export type Choice =
  | {
      key: string;
      label: ReactNode;
      onClick: () => void;
      href?: undefined;
      variant?: "default" | "primary";
      disabled?: boolean;
    }
  | {
      key: string;
      label: ReactNode;
      href: string;
      onClick?: () => void;
      variant?: "default" | "primary";
      disabled?: boolean;
    };

type Props = {
  choices: Choice[];
  disabled?: boolean;
  ariaLabel: string;
  /** Show the keyboard tip below the row. Defaults to true. */
  showHint?: boolean;
  /** Layout direction. Defaults to "row" (wraps). */
  direction?: "row" | "col";
  /** Align the row. Defaults to "start". */
  align?: "start" | "end" | "center";
};

// --- Component ----------------------------------------------------------

export function ChoiceRow({
  choices,
  disabled,
  ariaLabel,
  showHint = true,
  direction = "row",
  align = "start",
}: Props) {
  const [selected, setSelected] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  // Reset selection whenever the action set changes.
  const sig = choices.map((c) => c.key).join("|");
  useEffect(() => {
    setSelected(0);
  }, [sig]);

  // Install global Enter-held tracker once.
  useEffect(() => {
    ensureGlobalListeners();
  }, []);

  // Activation gate. `armed=false` means an activation key is currently
  // held from a prior context; we ignore activations until it is released.
  // Lazy init checks the module-level flag synchronously so we never
  // race the first autorepeat keydown after mount.
  const [armed, setArmed] = useState(() => {
    if (typeof window === "undefined") return true;
    ensureGlobalListeners();
    return !activationKeyHeld;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activationKeyHeld) {
      // (Re-)mounted or sig changed while a key was held — disarm and
      // wait for release.
      setArmed(false);
      const onRelease = () => setArmed(true);
      releaseListeners.add(onRelease);
      return () => {
        releaseListeners.delete(onRelease);
      };
    }
    setArmed(true);
  }, [sig]);

  // Re-evaluate focus whenever individual disabled states change (e.g. a
  // timed unlock like the Skip delay in LootMintPrompt).
  const disabledSig = choices.map((c) => (c.disabled ? "1" : "0")).join("");

  // Programmatically focus the selected element so Tab order is preserved
  // and the user can see where they are. If the selected element is disabled
  // (e.g. Skip during its 1-second lock), focus the first enabled button
  // instead so keyboard navigation works immediately. We use it for visual
  // focus only; activation goes through our gated handler below.
  useEffect(() => {
    if (disabled) return;
    let el = refs.current[selected];
    if (!el || (el as HTMLButtonElement).disabled) {
      // Fall through to the first enabled button.
      for (let i = 0; i < choices.length; i++) {
        const candidate = refs.current[i];
        if (candidate && !(candidate as HTMLButtonElement).disabled) {
          el = candidate;
          break;
        }
      }
    }
    if (!el) return;
    if (document.activeElement === el) return;
    el.focus({ preventScroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, sig, disabled, disabledSig]);

  function step(delta: 1 | -1) {
    let next = selected;
    for (let i = 0; i < choices.length; i++) {
      next = (next + delta + choices.length) % choices.length;
      if (!choices[next].disabled) break;
    }
    setSelected(next);
  }

  function activate() {
    if (disabled || !armed) return;
    const c = choices[selected];
    if (!c || c.disabled) return;
    const el = refs.current[selected];
    if (el) el.click();
    else if (c.onClick) c.onClick();
  }

  // Capture phase so we beat the native button/link Enter→click default.
  function onKeyDownCapture(e: React.KeyboardEvent<HTMLDivElement>) {
    if (choices.length === 0) return;

    const isActivation =
      e.key === "Enter" || e.key === " " || e.code === "Space";

    if (isActivation) {
      // Always swallow the browser default so we own activation timing.
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return; // ignore key autorepeat
      if (disabled || !armed) return;
      activate();
      return;
    }

    if (disabled) return;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelected(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSelected(choices.length - 1);
    }
  }

  const justify =
    align === "end" ? "justify-end" : align === "center" ? "justify-center" : "";

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`flex ${direction === "col" ? "flex-col" : "flex-wrap"} gap-2 ${justify}`}
        aria-label={ariaLabel}
        role="toolbar"
        onKeyDownCapture={onKeyDownCapture}
      >
        {choices.map((c, i) => {
          const isSelected = i === selected;
          const isDisabled = disabled || c.disabled;
          const common = {
            ref: (el: HTMLElement | null) => {
              refs.current[i] = el;
            },
            variant: c.variant ?? "default",
            selected: isSelected,
            tabIndex: isSelected ? 0 : -1,
          } as const;
          if (c.href !== undefined) {
            return (
              <ChoiceLink
                key={c.key}
                {...common}
                href={c.href}
                onClick={c.onClick}
                disabled={isDisabled}
              >
                {c.label}
              </ChoiceLink>
            );
          }
          return (
            <ChoiceButton
              key={c.key}
              {...common}
              onClick={c.onClick}
              disabled={isDisabled}
            >
              {c.label}
            </ChoiceButton>
          );
        })}
      </div>
      {showHint && choices.length > 0 && (
        <KbdHint multi={choices.length > 1} />
      )}
    </div>
  );
}

// --- Shared visual styling for selected/primary states ------------------

function choiceStyle(
  variant: "default" | "primary",
  selected: boolean,
): React.CSSProperties {
  const isPrimary = variant === "primary";
  return {
    background: isPrimary
      ? "var(--color-preset-accent)"
      : selected
        ? "rgba(255,255,255,0.14)"
        : "rgba(255,255,255,0.06)",
    color: isPrimary
      ? "var(--color-preset-bg)"
      : "var(--color-preset-fg)",
    border: isPrimary
      ? "none"
      : `1px solid ${selected ? "var(--color-preset-fg)" : "rgba(255,255,255,0.1)"}`,
    outline: selected ? "2px solid var(--color-preset-fg)" : "none",
    outlineOffset: selected ? "3px" : "0",
    boxShadow: selected ? "0 6px 18px -6px rgba(0,0,0,0.55)" : undefined,
    transform: selected ? "translateY(-2px)" : undefined,
    filter: selected ? "brightness(1.08)" : undefined,
  };
}

const CHOICE_CLASS =
  "rounded-md px-4 py-2.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none inline-flex items-center justify-center no-underline";

// --- ChoiceButton -------------------------------------------------------

type ChoiceButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
  selected?: boolean;
  tabIndex?: number;
};

const ChoiceButton = forwardRef<HTMLElement, ChoiceButtonProps>(
  function ChoiceButton(
    {
      children,
      onClick,
      disabled,
      variant = "default",
      selected = false,
      tabIndex,
    },
    ref,
  ) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        disabled={disabled}
        tabIndex={tabIndex}
        data-selected={selected ? "true" : undefined}
        className={CHOICE_CLASS}
        style={choiceStyle(variant, selected)}
      >
        {children}
      </button>
    );
  },
);

// --- ChoiceLink ---------------------------------------------------------

type ChoiceLinkProps = {
  children: ReactNode;
  href: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
  selected?: boolean;
  tabIndex?: number;
};

const ChoiceLink = forwardRef<HTMLElement, ChoiceLinkProps>(function ChoiceLink(
  {
    children,
    href,
    onClick,
    disabled,
    variant = "default",
    selected = false,
    tabIndex,
  },
  ref,
) {
  if (disabled) {
    // Render a disabled-looking placeholder; no navigation.
    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        aria-disabled="true"
        tabIndex={tabIndex}
        data-selected={selected ? "true" : undefined}
        className={CHOICE_CLASS + " opacity-40 cursor-not-allowed"}
        style={choiceStyle(variant, selected)}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      ref={ref as React.Ref<HTMLAnchorElement>}
      href={href}
      onClick={onClick}
      tabIndex={tabIndex}
      data-selected={selected ? "true" : undefined}
      className={CHOICE_CLASS}
      style={choiceStyle(variant, selected)}
    >
      {children}
    </Link>
  );
});

// --- KbdHint ------------------------------------------------------------

/**
 * Small inline hint that teaches the keyboard controls. Use under a
 * `ChoiceRow` (it's rendered automatically by default) or on its own
 * when a screen has only a single focused button.
 */
export function KbdHint({ multi = true }: { multi?: boolean }) {
  return (
    <p
      className="text-[10px] uppercase tracking-widest opacity-50 flex flex-wrap items-center gap-1.5 select-none"
      aria-hidden="true"
    >
      {multi && (
        <>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <span>navigate</span>
          <span className="opacity-50">·</span>
        </>
      )}
      <Kbd>Enter</Kbd>
      <span>{multi ? "to select" : "to continue"}</span>
    </p>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="font-mono text-[10px] px-1 py-px rounded"
      style={{
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.04)",
        color: "var(--color-preset-fg)",
      }}
    >
      {children}
    </kbd>
  );
}
