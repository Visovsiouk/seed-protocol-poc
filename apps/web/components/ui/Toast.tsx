"use client";

/**
 * Toast — the floating notification stack.
 *
 * A fixed top-right stack rendered through a body portal, so a toast never
 * inserts a box into the document flow — no layout shift, ever (the lesson
 * of the old inline warden banner, see EncounterFrame's focal-slot note).
 * Auto-dismisses after a few seconds; click dismisses immediately; the stack
 * caps at four with the oldest dropped first.
 *
 * Sits at z-[90], above every overlay (Dialog z-50, DefeatOverlay z-[60],
 * ConnectWizard z-[70], cinematic fade z-[80]) — a "Phase 2" or codex stamp
 * must stay visible even over a modal.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { DUR, EASE_OUT, transition, withReducedMotion } from "@/lib/ui/motion";

export type ToastTone = "accent" | "ok" | "danger";

export type ToastOptions = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type Toast = Required<Pick<ToastOptions, "title" | "tone" | "durationMs">> &
  Pick<ToastOptions, "description"> & { id: number };

const MAX_STACK = 4;
const DEFAULT_DURATION_MS = 6000;

const TONE_COLOR: Record<ToastTone, string> = {
  accent: "var(--color-preset-accent)",
  ok: "var(--color-ok)",
  danger: "var(--color-danger)",
};

const toastMotion: Variants = {
  hidden: { opacity: 0, y: -8, x: 16 },
  visible: { opacity: 1, y: 0, x: 0, transition },
  exit: { opacity: 0, x: 24, transition: { duration: DUR.fast, ease: EASE_OUT } },
};

const NotifyContext = createContext<(opts: ToastOptions) => void>(() => {});

/** Fire a toast from any client component under <NotificationProvider/>. */
export function useNotify(): (opts: ToastOptions) => void {
  return useContext(NotifyContext);
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const reduced = useReducedMotion();
  const color = TONE_COLOR[toast.tone];

  // Each card owns its retire timer; unmount (stack overflow / manual
  // dismiss) clears it.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    const t = window.setTimeout(() => onDismissRef.current(), toast.durationMs);
    return () => window.clearTimeout(t);
  }, [toast.durationMs]);

  return (
    <motion.div
      layout
      variants={withReducedMotion(toastMotion, reduced)}
      initial="hidden"
      animate="visible"
      exit="exit"
      role={toast.tone === "danger" ? "alert" : "status"}
      onClick={onDismiss}
      className="pointer-events-auto cursor-pointer rounded-lg border px-4 py-3 backdrop-blur-sm"
      style={{
        background: `color-mix(in oklab, ${color} 12%, var(--color-preset-bg))`,
        borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
        boxShadow: `0 12px 32px -12px color-mix(in oklab, ${color} 45%, transparent)`,
      }}
    >
      <div
        className="font-mono text-xs uppercase tracking-widest"
        style={{ color }}
      >
        {toast.title}
      </div>
      {toast.description && (
        <p className="mt-1 text-xs leading-relaxed opacity-80">
          {toast.description}
        </p>
      )}
    </motion.div>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const [mounted, setMounted] = useState(false);

  // Portal target only exists client-side; gate the first render (same
  // pattern as <Dialog/>).
  useEffect(() => setMounted(true), []);

  const notify = useCallback((opts: ToastOptions) => {
    setToasts((prev) => {
      const next: Toast = {
        id: nextId.current++,
        title: opts.title,
        description: opts.description,
        tone: opts.tone ?? "accent",
        durationMs: opts.durationMs ?? DEFAULT_DURATION_MS,
      };
      return [...prev, next].slice(-MAX_STACK);
    });
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
          >
            <AnimatePresence initial={false}>
              {toasts.map((t) => (
                <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </NotifyContext.Provider>
  );
}
