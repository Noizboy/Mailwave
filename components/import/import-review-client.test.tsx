import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { renderWithProviders } from "@/test/render";
import { ImportReviewClient } from "./import-review-client";

const importData = {
  id: "imp-1",
  filename: "contacts.csv",
  rowCount: 3,
  validCount: 1,
  invalidCount: 1,
  duplicateCount: 1,
  status: "review",
  columnMapping: { email: "email", name: "firstName" },
  rows: [
    {
      id: "r1",
      rowIndex: 0,
      status: "valid",
      errorReason: null,
      rowData: { email: "good@x.com", name: "Good" },
    },
    {
      id: "r2",
      rowIndex: 1,
      status: "invalid",
      errorReason: "Invalid email format",
      rowData: { email: "bad", name: "Bad" },
    },
    {
      id: "r3",
      rowIndex: 2,
      status: "duplicate",
      errorReason: "Email already exists",
      rowData: { email: "dup@x.com", name: "Dup" },
    },
  ],
};

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/import/imp-1") && method === "GET") {
      return new Response(JSON.stringify(importData), { status: 200 });
    }
    if (url.endsWith("/rows") && method === "DELETE") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.endsWith("/save") && method === "POST") {
      return new Response(JSON.stringify({ savedCount: 1, skippedCount: 2 }), { status: 200 });
    }
    if (url.endsWith("/cancel") && method === "POST") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderReview() {
  renderWithProviders(<ImportReviewClient importId="imp-1" />);
  await screen.findByText("contacts.csv");
}

describe("ImportReviewClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders rows with status badges and summary counts", async () => {
    mockFetch();
    await renderReview();

    // Badge labels also appear as summary-card labels / filter buttons, so use getAllByText
    expect(screen.getAllByText("Valid").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Invalid Email")).toBeInTheDocument();
    expect(screen.getAllByText("Duplicate").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Invalid email format")).toBeInTheDocument();
    expect(screen.getByText("good@x.com")).toBeInTheDocument();
  });

  it("filters rows by status", async () => {
    mockFetch();
    await renderReview();

    fireEvent.click(screen.getByRole("button", { name: "Invalid" }));

    expect(screen.queryByText("good@x.com")).not.toBeInTheDocument();
    expect(screen.getByText("bad")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("good@x.com")).toBeInTheDocument();
  });

  it("bulk-selects rows and deletes them via the rows endpoint", async () => {
    const fetchMock = mockFetch();
    await renderReview();

    // First checkbox is the select-all in the header
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    expect(await screen.findByText("3 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /delete selected/i }));

    // Confirmation dialog opens — confirm to actually delete
    const confirmButton = await screen.findByRole("button", { name: "Delete" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(del).toBeDefined();
      expect(JSON.parse(String(del?.[1]?.body)).rowIds).toEqual(["r1", "r2", "r3"]);
    });
  });

  it("saves contacts with a new list name and navigates to contacts", async () => {
    const fetchMock = mockFetch();
    await renderReview();

    fireEvent.click(screen.getByRole("button", { name: /save contacts/i }));
    await screen.findByText(/valid contacts will be saved/);

    fireEvent.click(screen.getByRole("button", { name: /new list/i }));
    fireEvent.change(screen.getByPlaceholderText(/Tech Leaders Q1/), {
      target: { value: "Imported Q3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create list & save/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts"));
    const save = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/save"));
    expect(JSON.parse(String(save?.[1]?.body))).toEqual({ createListName: "Imported Q3" });
  });

  it("cancels the import and returns to upload", async () => {
    const fetchMock = mockFetch();
    await renderReview();

    fireEvent.click(screen.getByRole("button", { name: /cancel import/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/upload"));
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/cancel"))).toBe(true);
  });
});
