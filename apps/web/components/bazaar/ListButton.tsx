"use client";

import { useState } from "react";
import { ListDialog } from "./ListDialog";
import { Button } from "@/components/ui";

/**
 * Header-level "List an asset" button. Opens the ListDialog modal which
 * loads the connected wallet's inventory and submits a `list()` tx.
 */
export function ListButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button intent="primary" size="sm" onClick={() => setOpen(true)}>
        List an asset
      </Button>
      <ListDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
