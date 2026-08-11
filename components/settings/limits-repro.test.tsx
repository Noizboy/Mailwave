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
      // NOTE: a fresh object each call, but deeply equal -> structural sharing
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

describe("SendingLimitsSettings repro", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps showing values after saving unchanged values", async () => {
    mockFetch();
    renderWithProviders(<SendingLimitsSettings />);

    const daily = (await screen.findByDisplayValue("500")) as HTMLInputElement;
    expect(daily.value).toBe("500");

    // Save WITHOUT changing anything -> refetch returns deeply-equal data
    fireEvent.click(screen.getByRole("button", { name: /save limits/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save limits/i })).toBeInTheDocument();
    });

    // Does the form come back, or are we stuck on the spinner?
    await waitFor(
      () => {
        expect(screen.getByDisplayValue("500")).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });
});
