import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/shared/filter-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ContactList } from "./contact-types";

interface ContactsFilterBarProps {
  search: string; status: string; listId: string; fromDate: string; toDate: string; perPage: number; lists: ContactList[];
  onSearchChange: (value: string) => void; onStatusChange: (value: string) => void; onListChange: (value: string) => void;
  onFromDateChange: (value: string) => void; onToDateChange: (value: string) => void; onPerPageChange: (value: number) => void;
}

export function ContactsFilterBar(props: ContactsFilterBarProps) {
  return <div className="sticky top-0 z-10 border-b bg-background px-6 py-3"><FilterBar>
    <div className="relative min-w-[240px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search by name, email or company…" value={props.search} onChange={(e) => props.onSearchChange(e.target.value)} className="pl-9" /></div>
    <Select value={props.listId} onValueChange={props.onListChange}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All lists</SelectItem>{props.lists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent></Select>
    <Select value={props.status} onValueChange={props.onStatusChange}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="subscribed">Subscribed</SelectItem><SelectItem value="unsubscribed">Unsubscribed</SelectItem><SelectItem value="suppressed">Suppressed</SelectItem><SelectItem value="invalid">Invalid</SelectItem></SelectContent></Select>
    <div className="flex items-center gap-1.5"><span className="whitespace-nowrap text-xs text-muted-foreground">Last sent</span><Input type="date" value={props.fromDate} onChange={(e) => props.onFromDateChange(e.target.value)} className="w-[140px]" /><span className="text-xs text-muted-foreground">–</span><Input type="date" value={props.toDate} onChange={(e) => props.onToDateChange(e.target.value)} className="w-[140px]" /></div>
    <Select value={String(props.perPage)} onValueChange={(value) => props.onPerPageChange(Number(value))}><SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25">25 / page</SelectItem><SelectItem value="50">50 / page</SelectItem><SelectItem value="100">100 / page</SelectItem></SelectContent></Select>
  </FilterBar></div>;
}
