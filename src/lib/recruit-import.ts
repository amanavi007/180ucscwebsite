import { normalizeName } from "./recruit-matching";

export interface ParsedAttendee {
  rawName: string;
  email: string | null;
  minutes: number | null;
}

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/** Splits one CSV line, honouring double quotes and "" escapes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

interface Header {
  index: number;
  name: number;
  first: number;
  last: number;
  email: number;
  minutes: number;
}

function findHeader(rows: string[][]): Header | null {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => c.toLowerCase());
    const first = cells.findIndex((c) => c === "first name");
    const last = cells.findIndex((c) => c === "last name");
    const name = cells.findIndex((c) => c.startsWith("name"));
    const email = cells.findIndex((c) => c.includes("email"));
    const minutes = cells.findIndex((c) => c.includes("duration"));
    const join = cells.findIndex((c) => c.includes("join time"));
    const hasName = name >= 0 || (first >= 0 && last >= 0);
    if (hasName && (email >= 0 || minutes >= 0 || join >= 0)) {
      return { index: i, name, first, last, email, minutes };
    }
  }
  return null;
}

function mergeAttendees(rows: ParsedAttendee[]): ParsedAttendee[] {
  const byKey = new Map<string, ParsedAttendee>();
  for (const row of rows) {
    const key = row.email ?? (normalizeName(row.rawName) || row.rawName.toLowerCase());
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      continue;
    }
    if (row.minutes !== null) existing.minutes = (existing.minutes ?? 0) + row.minutes;
    if (!existing.email && row.email) existing.email = row.email;
  }
  return [...byKey.values()];
}

/** Zoom participant/registration CSVs or a plain list of names (optionally "name, email"). */
export function parseAttendeeInput(text: string): ParsedAttendee[] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, ",").trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const rows = lines.map(parseCsvLine);
  const header = findHeader(rows);
  const parsed: ParsedAttendee[] = [];

  if (header) {
    for (const cells of rows.slice(header.index + 1)) {
      const name =
        header.first >= 0 && header.last >= 0
          ? `${cells[header.first] ?? ""} ${cells[header.last] ?? ""}`.trim()
          : (cells[header.name] ?? "");
      if (!name) continue;
      const emailCell = header.email >= 0 ? (cells[header.email] ?? "").toLowerCase() : "";
      const mins = header.minutes >= 0 ? Number(cells[header.minutes]) : Number.NaN;
      parsed.push({
        rawName: name,
        email: EMAIL_RE.test(emailCell) ? emailCell : null,
        minutes: Number.isFinite(mins) ? mins : null,
      });
    }
  } else {
    for (const cells of rows) {
      if (cells.length === 1 && EMAIL_RE.test(cells[0])) {
        const email = cells[0].toLowerCase();
        parsed.push({ rawName: email.split("@")[0].replace(/[._]+/g, " "), email, minutes: null });
      } else if (cells.length === 2 && EMAIL_RE.test(cells[1])) {
        parsed.push({ rawName: cells[0], email: cells[1].toLowerCase(), minutes: null });
      } else {
        parsed.push({ rawName: cells.join(", "), email: null, minutes: null });
      }
    }
  }

  return mergeAttendees(parsed);
}

/** A tidy display name for a brand-new applicant created from a list entry. */
export function cleanDisplayName(raw: string): string {
  let s = raw.replace(/\([^)]*\)/g, " ").replace(/\s+-\s+.*$/, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (/^[^,]+,[^,]+$/.test(s)) {
    const [last, first] = s.split(",");
    s = `${first.trim()} ${last.trim()}`;
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s === s.toLowerCase() || s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/(^|\s)([a-z])/g, (_, space: string, ch: string) => `${space}${ch.toUpperCase()}`);
  }
  return s;
}
