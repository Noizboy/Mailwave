import Link from "next/link";
import { Edit2, MoreHorizontal, Trash2, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn, formatDate } from "@/lib/utils";
import type { Contact } from "./contact-types";

interface ContactsTableProps {
  contacts: Contact[]; isLoading: boolean; hasFilters: boolean; selectedIds: Set<string>; suppressAfterEmails: number; allSelected: boolean;
  onToggleAll: () => void; onToggleSelect: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void;
}

export function ContactsTable({ contacts, isLoading, hasFilters, selectedIds, suppressAfterEmails, allSelected, onToggleAll, onToggleSelect, onEdit, onDelete }: ContactsTableProps) {
  if (isLoading) return <CardContent className="p-0"><div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-10 w-full" />)}</div></CardContent>;
  if (contacts.length === 0) return <CardContent className="p-0">{hasFilters ? <div className="py-12 text-center text-sm text-muted-foreground">No contacts match your filters.</div> : <EmptyState icon={Users} title="No contacts yet" description="Upload your first CSV to start building personalized campaigns." action={<Button size="sm" asChild><Link href="/upload"><Upload className="h-4 w-4" />Upload CSV</Link></Button>} />}</CardContent>;
  return <CardContent className="p-0"><Table><TableHeader><TableRow><TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={onToggleAll} /></TableHead><TableHead>Status</TableHead><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Company</TableHead><TableHead>List</TableHead><TableHead className="text-right">Sent / Limit</TableHead><TableHead>Last Campaign</TableHead><TableHead>Last Sent</TableHead><TableHead className="w-10" /></TableRow></TableHeader><TableBody>{contacts.map((contact) => <ContactTableRow key={contact.id} contact={contact} selected={selectedIds.has(contact.id)} suppressAfterEmails={suppressAfterEmails} onToggleSelect={onToggleSelect} onEdit={onEdit} onDelete={onDelete} />)}</TableBody></Table></CardContent>;
}

function ContactTableRow({ contact, selected, suppressAfterEmails, onToggleSelect, onEdit, onDelete }: { contact: Contact; selected: boolean; suppressAfterEmails: number; onToggleSelect: (id: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
  const sentCount = contact.emailsSentCount ?? 0; const atLimit = sentCount >= suppressAfterEmails; const lastEmail = contact.campaignEmails?.[0]; const displayName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—";
  return <TableRow onClick={() => onEdit(contact.id)} className={cn("cursor-pointer", selected && "bg-accent/40 data-[state=selected]:bg-accent")} data-state={selected ? "selected" : undefined}>
    <TableCell onClick={(event) => event.stopPropagation()}><Checkbox checked={selected} onCheckedChange={() => onToggleSelect(contact.id)} /></TableCell><TableCell><StatusBadge status={contact.status} /></TableCell><TableCell className="font-mono text-xs">{contact.email}</TableCell><TableCell className="font-medium">{displayName}</TableCell><TableCell className="text-muted-foreground">{contact.company ?? "—"}</TableCell><TableCell className="text-muted-foreground">{contact.listMembers.length > 0 ? contact.listMembers[0].list.name : "—"}</TableCell><TableCell className="text-right tabular-nums"><span className={cn("inline-block rounded px-1.5 py-0.5 font-mono text-xs font-semibold", sentCount === 0 ? "bg-muted text-muted-foreground" : atLimit ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700")}>{sentCount}/{suppressAfterEmails}</span></TableCell><TableCell className="text-muted-foreground">{lastEmail?.campaign?.name ?? "—"}</TableCell><TableCell className="text-muted-foreground">{lastEmail?.sentAt ? formatDate(lastEmail.sentAt) : "—"}</TableCell><TableCell className="text-right" onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Row actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => onEdit(contact.id)}><Edit2 className="h-4 w-4" />Edit Contact</DropdownMenuItem><DropdownMenuItem onClick={() => onDelete(contact.id)} className="text-destructive focus:bg-destructive/10 focus:text-destructive"><Trash2 className="h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
  </TableRow>;
}
