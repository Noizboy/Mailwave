import { describe, it, expect } from "vitest";
import {
  parseCsvText,
  detectEmailColumn,
  validateEmail,
  buildColumnMapping,
} from "./csv";

describe("csv parseCsvText", () => {
  it("parses a simple CSV with headers", () => {
    const result = parseCsvText("email,name\na@b.com,Alice\nc@d.com,Carol");
    expect(result.headers).toEqual(["email", "name"]);
    expect(result.rowCount).toBe(2);
    expect(result.rows[0]).toEqual({ email: "a@b.com", name: "Alice" });
    expect(result.errors).toEqual([]);
  });

  it("handles quoted fields containing commas", () => {
    const result = parseCsvText('email,company\na@b.com,"Acme, Inc."');
    expect(result.rows[0].company).toBe("Acme, Inc.");
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const result = parseCsvText('email,note\na@b.com,"said ""hello"" twice"');
    expect(result.rows[0].note).toBe('said "hello" twice');
  });

  it("handles CRLF line endings", () => {
    const result = parseCsvText("email,name\r\na@b.com,Alice\r\n");
    expect(result.rowCount).toBe(1);
    expect(result.rows[0].name).toBe("Alice");
  });

  it("skips blank lines", () => {
    const result = parseCsvText("email\na@b.com\n\n\nc@d.com\n");
    expect(result.rowCount).toBe(2);
  });

  it("pads ragged rows with empty strings", () => {
    const result = parseCsvText("email,name,company\na@b.com,Alice");
    expect(result.rows[0]).toEqual({ email: "a@b.com", name: "Alice", company: "" });
  });

  it("returns an error for an empty file", () => {
    const result = parseCsvText("");
    expect(result.rowCount).toBe(0);
    expect(result.errors).toContain("CSV file is empty.");
  });

  it("reports duplicate headers (case-insensitive)", () => {
    const result = parseCsvText("email,Name,name\na@b.com,x,y");
    expect(result.errors.some((e) => e.includes("Duplicate column headers"))).toBe(true);
  });

  it("reports a missing email column", () => {
    const result = parseCsvText("name,company\nAlice,Acme");
    expect(result.errors.some((e) => e.includes("No email column detected"))).toBe(true);
  });
});

describe("csv detectEmailColumn", () => {
  it.each([
    ["email"],
    ["Email"],
    ["EMAIL"],
    ["E-Mail"],
    ["correo"],
    ["mail"],
    ["Email Address"],
  ])("detects %s", (header) => {
    expect(detectEmailColumn(["name", header])).toBe(header);
  });

  it("returns null when no email-like header exists", () => {
    expect(detectEmailColumn(["name", "company", "phone"])).toBeNull();
  });
});

describe("csv validateEmail", () => {
  it.each([
    ["a@b.com", true],
    ["first.last+tag@sub.domain.co", true],
    ["  padded@ok.com  ", true],
    ["missing-at.com", false],
    ["no@tld", false],
    ["spa ce@b.com", false],
    ["", false],
  ])("validateEmail(%j) → %s", (input, expected) => {
    expect(validateEmail(input)).toBe(expected);
  });
});

describe("csv buildColumnMapping", () => {
  it("maps known English headers to canonical fields", () => {
    const mapping = buildColumnMapping(["Email Address", "First Name", "Last_Name", "Company", "Job Title"]);
    expect(mapping).toEqual({
      "Email Address": "email",
      "First Name": "firstName",
      "Last_Name": "lastName",
      Company: "company",
      "Job Title": "jobTitle",
    });
  });

  it("maps known Spanish headers to canonical fields", () => {
    const mapping = buildColumnMapping(["correo", "nombre", "apellido", "empresa", "cargo"]);
    expect(mapping).toEqual({
      correo: "email",
      nombre: "firstName",
      apellido: "lastName",
      empresa: "company",
      cargo: "jobTitle",
    });
  });

  it("passes unknown headers through as custom fields", () => {
    const mapping = buildColumnMapping(["email", "favorite_color"]);
    expect(mapping.favorite_color).toBe("favorite_color");
  });

  it("maps note-like headers to aiHint", () => {
    const mapping = buildColumnMapping(["notes", "AI Hint"]);
    expect(mapping.notes).toBe("aiHint");
    expect(mapping["AI Hint"]).toBe("aiHint");
  });
});
