import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ListMode = "none" | "existing" | "new";
export type ImportDestination = { listId?: string; createListName?: string };

interface ImportDestinationListDialogProps {
  open: boolean;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (destination: ImportDestination) => void;
}

export function ImportDestinationListDialog({ open, validCount, invalidCount, duplicateCount, saving, onOpenChange, onSave }: ImportDestinationListDialogProps) {
  const [listMode, setListMode] = useState<ListMode>("none");
  const [selectedListId, setSelectedListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const { data: existingLists = [] } = useQuery<{ id: string; name: string; totalContacts: number }[]>({ queryKey: ["lists"], queryFn: () => fetch("/api/lists").then((response) => response.json()), enabled: open });

  const reset = () => { setListMode("none"); setSelectedListId(""); setNewListName(""); };
  const handleOpenChange = (nextOpen: boolean) => { onOpenChange(nextOpen); if (!nextOpen) reset(); };
  const destination: ImportDestination = listMode === "existing" && selectedListId ? { listId: selectedListId } : listMode === "new" && newListName.trim() ? { createListName: newListName.trim() } : {};

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Save Contacts</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground"><span className="font-semibold text-emerald-700">{validCount}</span> valid contacts will be saved.{invalidCount + duplicateCount > 0 && <span> ({invalidCount + duplicateCount} invalid/duplicate rows will be skipped.)</span>}</p>
          <div className="space-y-1.5"><Label>Assign to a list</Label><div className="flex overflow-hidden rounded-md border">
            {(["none", "existing", "new"] as const).map((mode) => <button key={mode} type="button" onClick={() => setListMode(mode)} className={cn("flex-1 px-3 py-2 text-xs font-medium transition-colors", listMode === mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}>{mode === "none" ? "No list" : mode === "existing" ? "Existing list" : "New list"}</button>)}
          </div></div>
          {listMode === "existing" && <div className="space-y-1.5"><Label>Select list</Label><Select value={selectedListId} onValueChange={setSelectedListId}><SelectTrigger><SelectValue placeholder="Choose a list…" /></SelectTrigger><SelectContent>{existingLists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}<span className="ml-1.5 text-muted-foreground">({list.totalContacts})</span></SelectItem>)}{existingLists.length === 0 && <div className="px-2 py-3 text-center text-xs text-muted-foreground">No lists found. Create one instead.</div>}</SelectContent></Select></div>}
          {listMode === "new" && <div className="space-y-1.5"><Label>New list name</Label><Input placeholder="e.g. Tech Leaders Q1" value={newListName} onChange={(event) => setNewListName(event.target.value)} /></div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button><Button onClick={() => onSave(destination)} disabled={saving || (listMode === "existing" && !selectedListId) || (listMode === "new" && !newListName.trim())}>{saving ? "Saving…" : listMode === "new" ? "Create List & Save" : listMode === "existing" ? "Add to List & Save" : "Save Contacts"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
