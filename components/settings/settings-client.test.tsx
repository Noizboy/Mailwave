import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

// Must be hoisted before the component import.
let searchParamsString = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  toast: Object.assign(vi.fn(), {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  }),
  useToast: () => ({ toast: {} }),
}));

import { renderWithProviders } from "@/test/render";
import { SettingsClient } from "./settings-client";

// ---------------------------------------------------------------------------
// Shared mock helpers
// ---------------------------------------------------------------------------

interface MockFetchOptions {
  smtpConfig?: Record<string, unknown> | null;
  aiConfig?: Record<string, unknown> | null;
  limitsData?: Record<string, unknown>;
  accountData?: Record<string, unknown>;
  notifPrefs?: Record<string, boolean>;
  saveShouldFail?: boolean;
}

function mockFetch(opts: MockFetchOptions = {}) {
  const {
    smtpConfig = null,
    aiConfig = null,
    limitsData = { dailyLimit: 500, hourlyLimit: 50, suppressAfterEmails: 3 },
    accountData = { id: "u1", name: "Alice Smith", email: "alice@example.com", createdAt: new Date().toISOString() },
    notifPrefs = {},
    saveShouldFail = false,
  } = opts;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    // SMTP
    if (url.endsWith("/api/settings/smtp") && method === "GET") {
      if (!smtpConfig) return new Response("null", { status: 200 });
      return new Response(JSON.stringify(smtpConfig), { status: 200 });
    }
    if (url.endsWith("/api/settings/smtp") && method === "PUT") {
      return new Response(
        saveShouldFail ? JSON.stringify({ error: "Bad config" }) : JSON.stringify({}),
        { status: saveShouldFail ? 422 : 200 }
      );
    }
    if (url.includes("/api/settings/smtp/test") && method === "POST") {
      return new Response(JSON.stringify({}), { status: 200 });
    }

    // AI
    if (url.endsWith("/api/settings/ai") && method === "GET") {
      if (!aiConfig) return new Response("null", { status: 200 });
      return new Response(JSON.stringify(aiConfig), { status: 200 });
    }
    if (url.endsWith("/api/settings/ai") && method === "PUT") {
      return new Response(
        saveShouldFail ? JSON.stringify({ error: "Bad config" }) : JSON.stringify({}),
        { status: saveShouldFail ? 422 : 200 }
      );
    }
    if (url.endsWith("/api/settings/ai") && method === "DELETE") {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (url.includes("/api/settings/ai/test") && method === "POST") {
      return new Response(JSON.stringify({}), { status: 200 });
    }

    // Sending Limits
    if (url.includes("/api/settings/sending-limits") && method === "GET") {
      return new Response(JSON.stringify(limitsData), { status: 200 });
    }
    if (url.includes("/api/settings/sending-limits") && method === "PUT") {
      return new Response(
        saveShouldFail ? JSON.stringify({ error: "Bad" }) : JSON.stringify({}),
        { status: saveShouldFail ? 400 : 200 }
      );
    }

    // Account
    if (url.includes("/api/settings/account") && method === "GET") {
      return new Response(JSON.stringify(accountData), { status: 200 });
    }
    if (url.includes("/api/settings/account") && method === "PATCH") {
      return new Response(
        saveShouldFail ? JSON.stringify({ error: "Failed" }) : JSON.stringify({}),
        { status: saveShouldFail ? 500 : 200 }
      );
    }
    if (url.includes("/api/settings/account/password") && method === "POST") {
      return new Response(
        saveShouldFail ? JSON.stringify({ error: "Wrong password" }) : JSON.stringify({}),
        { status: saveShouldFail ? 400 : 200 }
      );
    }

    // Notification preferences
    if (url.includes("/api/settings/notification-preferences") && method === "GET") {
      return new Response(JSON.stringify(notifPrefs), { status: 200 });
    }
    if (url.includes("/api/settings/notification-preferences") && method === "PATCH") {
      return new Response(
        saveShouldFail ? JSON.stringify({ error: "Failed" }) : JSON.stringify({}),
        { status: saveShouldFail ? 500 : 200 }
      );
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Waits for the settings tabs to be rendered (header visible)
async function renderSettings(opts: MockFetchOptions = {}) {
  const fetchMock = mockFetch(opts);
  renderWithProviders(<SettingsClient />);
  await screen.findByText("Settings");
  return fetchMock;
}

// Click a tab by its label text
function clickTab(label: string) {
  fireEvent.click(screen.getByRole("tab", { name: label }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsString = "";
  });

  // ---- Rendering & tab structure -------------------------------------------

  it("renders all five tabs", async () => {
    await renderSettings();

    expect(screen.getByRole("tab", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Mail Server" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI Integration" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sending Limits" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notifications" })).toBeInTheDocument();
  });

  it("opens the Account tab by default", async () => {
    await renderSettings({
      accountData: { id: "u1", name: "Alice Smith", email: "alice@example.com", createdAt: new Date().toISOString() },
    });

    // Profile card should be visible
    expect(await screen.findByText("Profile")).toBeInTheDocument();
  });

  it("respects the ?tab= query parameter for initial tab selection", async () => {
    searchParamsString = "tab=smtp";
    await renderSettings({ smtpConfig: null });

    // SMTP tab content appears: no config → provider card selection
    expect(
      await screen.findByText("Choose a mail server provider")
    ).toBeInTheDocument();
  });

  // ---- Tab switching -------------------------------------------------------

  it("switches to the Mail Server tab and shows the provider selection", async () => {
    await renderSettings({ smtpConfig: null });

    clickTab("Mail Server");

    expect(
      await screen.findByText("Choose a mail server provider")
    ).toBeInTheDocument();
    expect(screen.getByText("Gmail SMTP")).toBeInTheDocument();
    expect(screen.getByText("Outlook SMTP")).toBeInTheDocument();
  });

  it("switches to the AI Integration tab and shows the provider selection when unconfigured", async () => {
    await renderSettings({ aiConfig: null });

    clickTab("AI Integration");

    expect(await screen.findByText("Choose an AI provider")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
  });

  it("switches to the Sending Limits tab and shows the form fields", async () => {
    await renderSettings();

    clickTab("Sending Limits");

    expect(await screen.findByText("Max emails per day")).toBeInTheDocument();
    expect(screen.getByText("Max emails per hour")).toBeInTheDocument();
    expect(screen.getByText("Auto-suppress after N emails")).toBeInTheDocument();
  });

  it("switches to the Notifications tab and shows preference groups", async () => {
    await renderSettings();

    clickTab("Notifications");

    expect(await screen.findByText("Campaigns")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("switches back to Account tab after visiting another tab", async () => {
    await renderSettings({
      accountData: { id: "u1", name: "Bob", email: "bob@example.com", createdAt: new Date().toISOString() },
    });

    clickTab("Sending Limits");
    await screen.findByText("Max emails per day");

    clickTab("Account");
    expect(await screen.findByText("Profile")).toBeInTheDocument();
  });

  // ---- Loading state -------------------------------------------------------

  it("shows a spinner inside the SMTP tab while data is loading", async () => {
    // Never resolve SMTP fetch
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/settings/smtp") && method === "GET") {
        return new Promise(() => {}); // pending forever
      }
      if (url.includes("/api/settings/account") && method === "GET") {
        return new Response(
          JSON.stringify({ id: "u1", name: "A", email: "a@b.com", createdAt: new Date().toISOString() }),
          { status: 200 }
        );
      }
      if (url.includes("/api/settings/notification-preferences") && method === "GET") {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.includes("/api/settings/sending-limits") && method === "GET") {
        return new Promise(() => {}); // pending
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }));

    renderWithProviders(<SettingsClient />);
    await screen.findByText("Settings");

    clickTab("Mail Server");

    // The SMTP tab uses a spinner from Loader2 while loading
    await waitFor(() => {
      const spinners = document.querySelectorAll(".animate-spin");
      expect(spinners.length).toBeGreaterThan(0);
    });
  });

  // ---- SMTP tab with existing config --------------------------------------

  it("shows SMTP configuration form fields when a config exists", async () => {
    const smtpConfig = {
      id: "smtp-1",
      host: "smtp.gmail.com",
      port: 587,
      username: "me@gmail.com",
      fromName: "Alice",
      fromEmail: "alice@example.com",
      replyTo: null,
      encryption: "tls",
      status: "connected",
      testedAt: new Date().toISOString(),
    };

    await renderSettings({ smtpConfig });

    clickTab("Mail Server");

    expect(await screen.findByText("SMTP Configuration")).toBeInTheDocument();
    expect(screen.getByDisplayValue("smtp.gmail.com")).toBeInTheDocument();
    expect(screen.getByText("Connection verified")).toBeInTheDocument();
  });

  // ---- Primary SMTP mutation: Save Settings --------------------------------

  it("submits SMTP form with updated host and calls PUT /api/settings/smtp", async () => {
    const smtpConfig = {
      id: "smtp-1",
      host: "smtp.example.com",
      port: 587,
      username: "user@example.com",
      fromName: "Corp",
      fromEmail: "corp@example.com",
      replyTo: null,
      encryption: "tls",
      status: "disconnected",
      testedAt: null,
    };
    const fetchMock = await renderSettings({ smtpConfig });

    clickTab("Mail Server");
    await screen.findByText("SMTP Configuration");

    const hostInput = screen.getByDisplayValue("smtp.example.com");
    fireEvent.change(hostInput, { target: { value: "smtp.updated.com" } });

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/api/settings/smtp") && init?.method === "PUT"
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call?.[1]?.body));
      expect(body.host).toBe("smtp.updated.com");
    });
  });

  // ---- AI tab: configured state -------------------------------------------

  it("shows AI Integration card when a provider is configured", async () => {
    const aiConfig = {
      id: "ai-1",
      provider: "openai",
      model: "gpt-4o-mini",
      baseUrl: null,
      status: "connected",
      testedAt: new Date().toISOString(),
    };

    await renderSettings({ aiConfig });

    clickTab("AI Integration");

    expect(await screen.findByText("AI Integration")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getAllByText("Connection verified").length).toBeGreaterThanOrEqual(1);
  });

  // ---- Primary AI mutation: Disconnect ------------------------------------

  it("calls DELETE /api/settings/ai when 'Disconnect' is clicked", async () => {
    const aiConfig = {
      id: "ai-1",
      provider: "anthropic",
      model: null,
      baseUrl: null,
      status: "connected",
      testedAt: null,
    };
    const fetchMock = await renderSettings({ aiConfig });

    clickTab("AI Integration");
    await screen.findByText("Anthropic");

    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/api/settings/ai") && init?.method === "DELETE"
      );
      expect(call).toBeDefined();
    });
  });

  // ---- Sending Limits mutation ---------------------------------------------

  it("submits sending limits and calls PUT /api/settings/sending-limits", async () => {
    const fetchMock = await renderSettings({
      limitsData: { dailyLimit: 500, hourlyLimit: 50, suppressAfterEmails: 3 },
    });

    clickTab("Sending Limits");
    await screen.findByText("Sending Limits");

    // Change the daily limit input
    const dailyInput = screen.getByDisplayValue("500");
    fireEvent.change(dailyInput, { target: { value: "200" } });

    fireEvent.click(screen.getByRole("button", { name: /save limits/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/sending-limits") && init?.method === "PUT"
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call?.[1]?.body));
      expect(body.dailyLimit).toBe(200);
    });
  });

  // ---- Account tab: primary mutation (save profile) -----------------------

  it("saves profile name and calls PATCH /api/settings/account", async () => {
    const fetchMock = await renderSettings({
      accountData: {
        id: "u1",
        name: "Alice Smith",
        email: "alice@example.com",
        createdAt: new Date().toISOString(),
      },
    });

    // Account tab is default
    await screen.findByText("Profile");

    const nameInput = await screen.findByDisplayValue("Alice Smith");
    fireEvent.change(nameInput, { target: { value: "Alice B. Smith" } });

    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/api/settings/account") &&
          init?.method === "PATCH"
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call?.[1]?.body));
      expect(body.name).toBe("Alice B. Smith");
    });
  });

  // ---- Account tab: error state -------------------------------------------

  it("shows an error toast when saving profile fails", async () => {
    await renderSettings({
      accountData: {
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
        createdAt: new Date().toISOString(),
      },
      saveShouldFail: true,
    });

    await screen.findByText("Profile");

    const nameInput = await screen.findByDisplayValue("Alice");
    fireEvent.change(nameInput, { target: { value: "Alice X" } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    // Error toast should appear
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Could not update profile",
        expect.stringContaining("unexpected")
      );
    });
  });

  // ---- Notifications tab: toggle mutation ----------------------------------

  it("calls PATCH /api/settings/notification-preferences when a toggle is clicked", async () => {
    const fetchMock = await renderSettings({
      notifPrefs: { campaign_complete: true },
    });

    clickTab("Notifications");
    await screen.findByText("Campaigns");

    // Toggle the "Campaign completed" switch (currently on → off)
    const campaignCompleteSwitch = screen.getByRole("switch", {
      name: "Campaign completed",
    });
    fireEvent.click(campaignCompleteSwitch);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes("/notification-preferences") && init?.method === "PATCH"
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call?.[1]?.body));
      expect(body.eventType).toBe("campaign_complete");
      expect(body.inApp).toBe(false);
    });
  });

  it("does not call PATCH for reserved (coming soon) notification items", async () => {
    const fetchMock = await renderSettings({ notifPrefs: {} });

    clickTab("Notifications");
    await screen.findByText("System");

    const systemAlertsSwitch = screen.getByRole("switch", { name: "System alerts" });
    expect(systemAlertsSwitch).toBeDisabled();

    fireEvent.click(systemAlertsSwitch);

    await new Promise((r) => setTimeout(r, 50));

    const call = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/notification-preferences") && init?.method === "PATCH"
    );
    expect(call).toBeUndefined();
  });

  // ---- SMTP tab: error state on save ---------------------------------------

  it("shows an error toast when SMTP save fails", async () => {
    const smtpConfig = {
      id: "smtp-1",
      host: "smtp.bad.com",
      port: 587,
      username: "u",
      fromName: "F",
      fromEmail: "f@f.com",
      replyTo: null,
      encryption: "tls",
      status: "disconnected",
      testedAt: null,
    };

    await renderSettings({ smtpConfig, saveShouldFail: true });

    clickTab("Mail Server");
    await screen.findByText("SMTP Configuration");

    fireEvent.click(screen.getByRole("button", { name: /save settings/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Could not save SMTP settings",
        expect.stringContaining("inputs")
      );
    });
  });
});
