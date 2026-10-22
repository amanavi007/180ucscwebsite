import { parseCsvText } from "@/lib/csv-parse";
import { normalizeEmail } from "./verify";
import type { ProspectDraftRow } from "./types";

type Field =
  | "company"
  | "website"
  | "summary"
  | "size"
  | "stage"
  | "niche"
  | "contactName"
  | "contactRole"
  | "contactEmail"
  | "whyFit"
  | "sources";

// Keys are headers with everything but letters and digits removed, lower-cased.
const HEADER_FIELDS: Record<string, Field> = {
  company: "company",
  website: "website",
  whattheydo: "summary",
  size: "size",
  stage: "stage",
  niche: "niche",
  contactname: "contactName",
  contactrole: "contactRole",
  contactemail: "contactEmail",
  whytheydneedconsulting: "whyFit",
  sourceurls: "sources",
};

const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface CsvError {
  line: number;
  message: string;
}

export function parseProspectCsv(text: string): { rows: ProspectDraftRow[]; errors: CsvError[] } {
  const table = parseCsvText(text);
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };

  const columns = new Map<Field, number>();
  table[0].forEach((h, i) => {
    const field = HEADER_FIELDS[headerKey(h)];
    if (field && !columns.has(field)) columns.set(field, i);
  });
  const missing: string[] = [];
  if (!columns.has("company")) missing.push("Company");
  if (!columns.has("contactEmail")) missing.push("Contact email");
  if (missing.length > 0) {
    return { rows: [], errors: [{ line: 1, message: `Missing required column(s): ${missing.join(", ")}.` }] };
  }

  const cell = (cells: string[], field: Field): string | null => {
    const i = columns.get(field);
    if (i === undefined) return null;
    const v = (cells[i] ?? "").trim();
    return v === "" ? null : v;
  };

  const rows: ProspectDraftRow[] = [];
  const errors: CsvError[] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const company = cell(cells, "company");
    const rawEmail = cell(cells, "contactEmail");
    if (!rawEmail) return void errors.push({ line, message: "Missing contact email." });
    if (!company) return void errors.push({ line, message: "Missing company." });
    const email = normalizeEmail(rawEmail);
    if (seen.has(email)) return void errors.push({ line, message: "Duplicate email in this file." });
    seen.add(email);

    const summary = cell(cells, "summary");
    const whyFit = cell(cells, "whyFit");
    const sourceUrl = (cell(cells, "sources") ?? "").split(/[;\n]/)[0]?.trim() ?? "";
    const facts = [summary, whyFit].filter((t): t is string => t !== null).map((t) => ({ text: t, sourceUrl }));
    const sizeStage = [cell(cells, "size"), cell(cells, "stage")].filter(Boolean).join(", ") || null;

    rows.push({
      company,
      website: cell(cells, "website"),
      niche: cell(cells, "niche"),
      sizeStage,
      summary,
      whyFit,
      facts,
      contactName: cell(cells, "contactName"),
      contactRole: cell(cells, "contactRole"),
      contactEmail: email,
    });
  });
  return { rows, errors };
}
