import { findMatches, normalizeName, type MatchCandidate, type MatchableApplicant } from "./recruit-matching";

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

export type ImportGroup = "matched" | "needs-look" | "new" | "ignored" | "already";

export interface ReviewContext {
  applicants: MatchableApplicant[];
  /** Normalized names the exec has told us to ignore this quarter. */
  ignoredNames: Set<string>;
  /** Normalized names of portal members/execs (hosts, co-hosts). */
  memberNames: Set<string>;
  /** Applicants who already hold live points for the chosen event. */
  awardedApplicantIds: Set<string>;
  minMinutes: number;
}

export interface ReviewRow {
  key: string;
  attendee: ParsedAttendee;
  group: ImportGroup;
  reason: string;
  candidates: MatchCandidate[];
  applicantId: string | null;
}

export function reviewImport(attendees: ParsedAttendee[], ctx: ReviewContext): ReviewRow[] {
  const byId = new Map(ctx.applicants.map((a) => [a.id, a]));
  const claimed = new Set<string>();

  return attendees.map((attendee, index): ReviewRow => {
    const key = String(index);
    const norm = normalizeName(attendee.rawName);
    const base = { key, attendee, candidates: [] as MatchCandidate[], applicantId: null as string | null };

    if (!norm && !attendee.email) return { ...base, group: "ignored", reason: "No name" };
    if (attendee.minutes !== null && attendee.minutes < ctx.minMinutes) {
      return { ...base, group: "ignored", reason: `Stayed ${Math.round(attendee.minutes)} min` };
    }
    if (norm && ctx.ignoredNames.has(norm)) return { ...base, group: "ignored", reason: "On your ignore list" };

    const matches = findMatches({ name: attendee.rawName, email: attendee.email }, ctx.applicants);
    const sure = matches.filter((m) => m.kind === "duplicate" || m.kind === "likely");

    if (sure.length === 1) {
      const id = sure[0].applicantId;
      if (claimed.has(id)) {
        return {
          ...base,
          group: "needs-look",
          reason: `Another name in this list already matched ${byId.get(id)?.name ?? "this applicant"}`,
          candidates: matches,
        };
      }
      claimed.add(id);
      if (ctx.awardedApplicantIds.has(id)) {
        return { ...base, group: "already", reason: "Already has points for this event", applicantId: id };
      }
      return { ...base, group: "matched", reason: "", applicantId: id };
    }

    if (matches.length > 0) {
      return {
        ...base,
        group: "needs-look",
        reason: sure.length > 1 ? "Matches more than one applicant" : "Looks similar to an existing applicant",
        candidates: matches,
      };
    }
    if (norm && ctx.memberNames.has(norm)) return { ...base, group: "ignored", reason: "Looks like a member or exec" };
    return { ...base, group: "new", reason: "" };
  });
}

export type ImportAction =
  | { action: "award"; applicantId: string }
  | { action: "new" }
  | { action: "skip" }
  | { action: "ignore" };

export function defaultActions(rows: ReviewRow[]): Record<string, ImportAction> {
  const out: Record<string, ImportAction> = {};
  for (const row of rows) {
    if (row.group === "matched" && row.applicantId) out[row.key] = { action: "award", applicantId: row.applicantId };
    else if (row.group === "new") out[row.key] = { action: "new" };
    else out[row.key] = { action: "skip" };
  }
  return out;
}

export type CommitRow =
  | { kind: "existing"; applicantId: string; alias: string | null }
  | { kind: "new"; name: string; email: string | null }
  | { kind: "ignore"; alias: string };

export function buildCommitRows(
  rows: ReviewRow[],
  actions: Record<string, ImportAction>,
  applicants: MatchableApplicant[],
): CommitRow[] {
  const byId = new Map(applicants.map((a) => [a.id, a]));
  const out: CommitRow[] = [];
  for (const row of rows) {
    const action = actions[row.key] ?? { action: "skip" };
    const norm = normalizeName(row.attendee.rawName);

    if (action.action === "award") {
      const applicant = byId.get(action.applicantId);
      const known = applicant ? [applicant.name, ...applicant.aliases].map(normalizeName) : [];
      out.push({
        kind: "existing",
        applicantId: action.applicantId,
        alias: norm && !known.includes(norm) ? norm : null,
      });
    } else if (action.action === "new") {
      out.push({ kind: "new", name: cleanDisplayName(row.attendee.rawName), email: row.attendee.email });
    } else if (action.action === "ignore" && norm) {
      out.push({ kind: "ignore", alias: norm });
    }
  }
  return out;
}

export function summarizeActions(
  rows: ReviewRow[],
  actions: Record<string, ImportAction>,
): { award: number; create: number; skip: number; unresolved: number } {
  let award = 0;
  let create = 0;
  let skip = 0;
  let unresolved = 0;
  for (const row of rows) {
    const action = actions[row.key] ?? { action: "skip" };
    if (action.action === "award") award++;
    else if (action.action === "new") create++;
    else {
      skip++;
      if (row.group === "needs-look" && action.action === "skip") unresolved++;
    }
  }
  return { award, create, skip, unresolved };
}
