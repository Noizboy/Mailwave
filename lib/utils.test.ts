import { describe, it, expect } from "vitest";
import { cn, formatDate, formatDateTime, maskSecret } from "./utils";

describe("cn", () => {
  it("merges conflicting tailwind classes (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional class values", () => {
    expect(cn("base", false && "hidden", undefined, "extra")).toBe("base extra");
  });
});

describe("formatDate", () => {
  it("formats a Date object as en-US short date", () => {
    expect(formatDate(new Date(2026, 0, 15))).toBe("Jan 15, 2026");
  });

  it("accepts an ISO string", () => {
    expect(formatDate("2026-03-05T12:00:00")).toBe("Mar 5, 2026");
  });
});

describe("formatDateTime", () => {
  it("includes both date and time", () => {
    const out = formatDateTime(new Date(2026, 6, 1, 14, 30));
    expect(out).toContain("Jul 1, 2026");
    expect(out).toMatch(/02:30\s?PM/);
  });
});

describe("maskSecret", () => {
  it("shows only the last 4 characters", () => {
    expect(maskSecret("sk-abcdef123456")).toBe("••••••••••••3456");
  });

  it("fully masks values shorter than 4 characters", () => {
    expect(maskSecret("abc")).toBe("••••••••");
  });

  it("fully masks the empty string", () => {
    expect(maskSecret("")).toBe("••••••••");
  });
});
