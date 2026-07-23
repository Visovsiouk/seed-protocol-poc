import type { ReactNode } from "react";
import { explorerUrl } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * Wraps a truncated tx hash / address / block number in a link to the
 * configured block explorer (Otterscan). When NEXT_PUBLIC_EXPLORER_URL is
 * unset it degrades to a plain <span> with the same className/title, so
 * surfaces render exactly as before the explorer existed.
 *
 * Otterscan routes: /tx/<hash>, /address/<addr>, /block/<number>.
 */
export function ExplorerLink({
  type,
  value,
  className,
  title,
  children,
}: {
  type: "tx" | "address" | "block";
  value: string | bigint;
  className?: string;
  /** Tooltip; defaults to the full value (handy for truncated display). */
  title?: string;
  children: ReactNode;
}) {
  const resolvedTitle = title ?? String(value);
  if (!explorerUrl) {
    return (
      <span className={className} title={resolvedTitle}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={`${explorerUrl}/${type}/${String(value)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(className, "hover:underline hover:opacity-100")}
      title={resolvedTitle}
    >
      {children}
    </a>
  );
}
