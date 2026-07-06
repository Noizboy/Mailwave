export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  errors: string[];
}

const EMAIL_PATTERNS = [
  /^email$/i,
  /^email.address$/i,
  /^e-mail$/i,
  /^correo$/i,
  /^mail$/i,
];

export function detectEmailColumn(headers: string[]): string | null {
  for (const header of headers) {
    if (EMAIL_PATTERNS.some((p) => p.test(header.trim()))) return header;
  }
  return null;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function parseCsvText(text: string): ParsedCsvResult {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length === 0) {
    return { headers: [], rows: [], rowCount: 0, errors: ["CSV file is empty."] };
  }

  const headers = parseRow(lines[0]);

  if (headers.length === 0) {
    return { headers: [], rows: [], rowCount: 0, errors: ["No columns detected."] };
  }

  // Detect duplicate headers
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const h of headers) {
    const key = h.toLowerCase().trim();
    if (seen.has(key)) dupes.push(h);
    seen.add(key);
  }
  if (dupes.length > 0) {
    errors.push(`Duplicate column headers detected: ${dupes.join(", ")}`);
  }

  const emailCol = detectEmailColumn(headers);
  if (!emailCol) {
    errors.push("No email column detected. CSV must include a column named 'email' or similar.");
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return { headers, rows, rowCount: rows.length, errors };
}

function parseRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export const KNOWN_COLUMN_MAP: Record<string, string> = {
  email: "email",
  "email address": "email",
  "e-mail": "email",
  mail: "email",
  correo: "email",
  firstname: "firstName",
  "first name": "firstName",
  "first_name": "firstName",
  nombre: "firstName",
  lastname: "lastName",
  "last name": "lastName",
  "last_name": "lastName",
  apellido: "lastName",
  company: "company",
  empresa: "company",
  organization: "company",
  jobtitle: "jobTitle",
  "job title": "jobTitle",
  "job_title": "jobTitle",
  title: "jobTitle",
  cargo: "jobTitle",
  notes: "aiHint",
  hint: "aiHint",
  "ai hint": "aiHint",
  note: "aiHint",
  linkedin: "linkedin",
  "linkedin url": "linkedin",
  "linkedin profile": "linkedin",
  "linkedin profile url": "linkedin",
};

export function buildColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const key = header.toLowerCase().trim();
    const mapped = KNOWN_COLUMN_MAP[key];
    if (mapped) mapping[header] = mapped;
    else mapping[header] = header; // keep as custom field
  }
  return mapping;
}
