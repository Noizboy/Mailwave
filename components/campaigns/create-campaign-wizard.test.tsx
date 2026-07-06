import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
let searchParamsString = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

import { renderWithProviders } from "@/test/render";
import { CreateCampaignWizard } from "./create-campaign-wizard";

const lists = [{ id: "list-1", name: "Leads", totalContacts: 5, subscribedContacts: 5 }];

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/lists")) {
      return new Response(JSON.stringify(lists), { status: 200 });
    }
    if (url.includes("/api/campaigns") && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "camp-9" }), { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function advance() {
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

describe("CreateCampaignWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsString = "";
  });

  it("blocks step 1 until required fields are valid", async () => {
    mockFetch();
    renderWithProviders(<CreateCampaignWizard />);

    await advance();

    expect(await screen.findByText("Campaign name is required")).toBeInTheDocument();
    expect(screen.getByText("Please select a list")).toBeInTheDocument();
    // Still on step 1
    expect(screen.getByText("Campaign Details")).toBeInTheDocument();
  });

  it("advances with valid fields and preserves values when navigating back", async () => {
    searchParamsString = "listId=list-1"; // pre-selects the list, avoiding Radix Select interaction in jsdom
    mockFetch();
    renderWithProviders(<CreateCampaignWizard />);

    fireEvent.change(screen.getByPlaceholderText(/Q1 Outreach/), {
      target: { value: "Mi Campaña" },
    });
    await advance();

    expect(await screen.findByText("AI Instructions")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByText("Campaign Details")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mi Campaña")).toBeInTheDocument();
  });

  it("walks all four steps and submits the assembled payload", async () => {
    searchParamsString = "listId=list-1";
    const fetchMock = mockFetch();
    renderWithProviders(<CreateCampaignWizard />);

    fireEvent.change(screen.getByPlaceholderText(/Q1 Outreach/), {
      target: { value: "Mi Campaña" },
    });
    await advance(); // → 2 (AI instructions)
    await screen.findByText("AI Instructions");
    fireEvent.change(screen.getByPlaceholderText(/discovery call/i), {
      target: { value: "Agendar demo" },
    });
    fireEvent.change(screen.getByPlaceholderText(/B2B cold email/i), {
      target: { value: "Write personalized cold emails targeting CTOs." },
    });
    await advance(); // → 3 (sending defaults are valid)
    await screen.findByText("Sending Settings");
    await advance(); // → 4 (review)
    await screen.findByText("Confirm & Create");

    // Summary reflects entered values
    expect(screen.getByText("Mi Campaña")).toBeInTheDocument();
    expect(screen.getByText("Leads")).toBeInTheDocument();
    expect(screen.getByText("Agendar demo")).toBeInTheDocument();

    // Wait for the 300ms reviewReady guard before clicking
    const createBtn = screen.getByRole("button", { name: /create campaign/i });
    await waitFor(() => expect(createBtn).not.toBeDisabled(), { timeout: 1500 });
    fireEvent.click(createBtn);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/campaigns/camp-9"));

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(String(postCall?.[1]?.body));
    expect(payload).toMatchObject({
      name: "Mi Campaña",
      listId: "list-1",
      goal: "Agendar demo",
      language: "en",
      emailLength: "medium",
      intervalType: "random",
      minInterval: 3,
      maxInterval: 8,
    });
    // Blank optionals are dropped, not sent as ""
    expect(payload.aiProvider).toBeUndefined();
    expect(payload.scheduledAt).toBeUndefined();
  });
});
