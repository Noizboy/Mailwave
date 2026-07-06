"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AddContactDialog } from "./add-contact-dialog";

export function AddContactButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add Contact
      </Button>
      <AddContactDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
