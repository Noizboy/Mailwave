export interface Contact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  status: string;
  emailsSentCount: number;
  createdAt: string;
  listMembers: Array<{ list: { id: string; name: string } }>;
  campaignEmails: Array<{ sentAt: string | null; campaign: { name: string } }>;
}

export interface ContactList {
  id: string;
  name: string;
}

export interface ContactFilters {
  search: string;
  status: string;
  listId: string;
  fromDate: string;
  toDate: string;
  page: number;
  limit: number;
}

export interface ContactsResponse {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  suppressAfterEmails: number;
}
