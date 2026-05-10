"use client";

import { useState } from "react";
import { ListDialog } from "./ListDialog";

/**
 * Header-level "List an asset" button. Opens the ListDialog modal which
 * loads the connected wallet's inventory and submits a `list()` tx.
 */
export function ListButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md px-3 py-1.5 text-sm font-medium"
        style={{
          background: "var(--color-preset-accent)",
          color: "var(--color-preset-bg)",
        }}
      >
        List an asset
      </button>
      <ListDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
