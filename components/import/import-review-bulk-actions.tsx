import { Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImportReviewBulkActionsProps {
  selectedCount: number;
  onDeleteSelected: () => void;
  onCancelImport: () => void;
  onSaveContacts: () => void;
}

export function ImportReviewBulkActions({ selectedCount, onDeleteSelected, onCancelImport, onSaveContacts }: ImportReviewBulkActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
        {selectedCount > 0 && <><span className="text-xs text-muted-foreground">{selectedCount} selected</span><Button variant="outline" size="sm" onClick={onDeleteSelected}><Trash2 className="h-4 w-4" /><span className="hidden sm:inline">Delete Selected</span></Button></>}
        <Button variant="outline" size="sm" onClick={onCancelImport}><X className="h-4 w-4" /><span className="hidden sm:inline">Cancel Import</span></Button>
        <Button size="sm" onClick={onSaveContacts}><Save className="h-4 w-4" />Save Contacts</Button>
    </div>
  );
}
