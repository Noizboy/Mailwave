export interface ReportSummary {
  totalContacts: number;
  activeContacts: number;
  totalCampaigns: number;
  completedCampaigns: number;
  totalEmailsSent: number;
  totalFailed: number;
  deliveryRate: number;
  totalOpened: number;
  openRate: number;
}

export interface CampaignReport {
  id: string;
  name: string;
  status: string;
  totalEmails: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  openedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  list: { name: string };
}

export interface EmailRecord {
  id: string;
  status: string;
  approvalStatus: string;
  subject: string | null;
  sentAt: string | null;
  errorReason: string | null;
  campaign: { id: string; name: string };
  contact: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface EmailStats {
  sent: number;
  failed: number;
  generated: number;
  skipped: number;
  pending: number;
}

export interface EmailsResponse {
  emails: EmailRecord[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  stats: EmailStats;
}

export interface ReportsData {
  summary: ReportSummary;
  campaigns: CampaignReport[];
}
