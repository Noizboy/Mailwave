import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { SendingLimitsSettings } from "./limits-settings";

vi.mock("@/hooks/use-toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function mockFetch(limits = { dailyLimit: 500, hourlyLimit: 50, suppressAfterEmails: 3 }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.includes("sending-limits") && method === "GET") {
      // A fresh object each call, but deeply equal — this is what makes TanStack
      // Query's structural sharing hand back the *previous* object reference.
      return new Response(JSON.stringify({ ...limits }), { status: 200 });
    }
    if (url.includes("sending-limits") && method === "PUT") {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("SendingLimitsSettings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("populates the inputs from the API", async () => {
    mockFetch();
    renderWithProviders(<SendingLimitsSettings />);

    expect(await screen.findByDisplayValue("500")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
  });

  // Regression: saving without changing anything made the post-save refetch return
  // deeply-equal data, so structural sharing kept `limitsData` referentially stable.
  // The sync effect never re-ran and the form stayed null — inputs blank / stuck on
  // the spinner until a full page refresh.
  it("keeps the values visible after saving unchanged values", async () => {
    mockFetch();
    renderWithProviders(<SendingLimitsSettings />);

    await screen.findByDisplayValue("500");
    fireEvent.click(screen.getByRole("button", { name: /save limits/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    });
  });
});
