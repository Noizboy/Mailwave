import type { ReportsData, EmailsResponse } from "./report-types";

export async function fetchReports(): Promise<ReportsData> {
  const res = await fetch("/api/reports");
  if (!res.ok) throw new Error("Failed");
  return res.json();
}

export function buildEmailsUrl(params: {
  page: number;
  perPage: number;
  campaignId: string;
  status: string;
  q: string;
}): string {
  const url = new URL("/api/reports/emails", window.location.origin);
  if (params.campaignId) url.searchParams.set("campaignId", params.campaignId);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.q) url.searchParams.set("q", params.q);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("perPage", String(params.perPage));
  return url.toString();
}

export async function fetchEmails(params: {
  page: number;
  perPage: number;
  status: string;
  q: string;
}): Promise<EmailsResponse> {
  const res = await fetch(
    buildEmailsUrl({ ...params, campaignId: "" })
  );
  if (!res.ok) throw new Error("Failed");
  return res.json();
}
