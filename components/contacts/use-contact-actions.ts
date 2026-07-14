import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

export function useContactActions(selectedIds: Set<string>, clearSelection: () => void) {
  const queryClient = useQueryClient();
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showAssignList, setShowAssignList] = useState(false);
  const [showChangeStatus, setShowChangeStatus] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["contacts"] });
  const deleteContact = async () => { if (!deleteTargetId) return; const res = await fetch(`/api/contacts/${deleteTargetId}`, { method: "DELETE" }); if (res.ok) { toast.success("Contact deleted", "The contact has been permanently removed."); invalidate(); } setDeleteTargetId(null); };
  const deleteSelected = async () => { const count = selectedIds.size; await Promise.all([...selectedIds].map((id) => fetch(`/api/contacts/${id}`, { method: "DELETE" }))); toast.success(`${count} contact${count === 1 ? "" : "s"} deleted`, "They have been permanently removed from your account."); clearSelection(); setShowBulkDeleteConfirm(false); invalidate(); };
  const completeBulkAction = () => { clearSelection(); invalidate(); };
  return { showBulkDeleteConfirm, setShowBulkDeleteConfirm, showAssignList, setShowAssignList, showChangeStatus, setShowChangeStatus, deleteTargetId, setDeleteTargetId, editContactId, setEditContactId, deleteContact, deleteSelected, completeBulkAction };
}
