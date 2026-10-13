import { isPlausibleEmail } from "@/lib/recruit";
import { findMatches, type MatchableApplicant, type MatchClass } from "@/lib/recruit-matching";

export interface ParsedApplication {
  rowNumber: number;
  name: string;
  email: string;
  submittedAt: string | null;
  graduationTerm: string | null;
  major: string | null;
  howHeard: string | null;
  essayWhy: string | null;
  essayTeamwork: string | null;
  essayBring: string | null;
  resumeUrl: string | null;
}

export interface ParseResult {
  applications: ParsedApplication[];
  skipped: { rowNumber: number; reason: string }[];
  unmapped: string[];
  duplicatesInFile: number;
  missingRequired: ("name" | "email")[];
}

type Field = Exclude<keyof ParsedApplication, "rowNumber">;

const MATCHERS: { field: Field | "ignored"; test: (h: string) => boolean }[] = [
  { field: "ignored", test: (h) => h.includes("availability for an interview") || h.includes("none of the above times") },
  { field: "submittedAt", test: (h) => h === "timestamp" },
  { field: "email", test: (h) => h.includes("email") },
  { field: "name", test: (h) => /\bname\b/.test(h) },
  { field: "graduationTerm", test: (h) => h.includes("graduation") },
  { field: "major", test: (h) => h.includes("major") },
  { field: "howHeard", test: (h) => h.includes("hear about") },
  { field: "essayWhy", test: (h) => h.includes("why are you interested") },
  { field: "essayTeamwork", test: (h) => h.includes("project with a team") },
  { field: "essayBring", test: (h) => h.includes("diverse group") },
  { field: "resumeUrl", test: (h) => h.includes("resume") },
];

/** The form labels this column "First, Last Name", so a comma means First, Last — join, don't flip. */
export function cleanApplicantName(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  const m = t.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[1].trim()} ${m[2].trim()}` : t;
}

function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).replace(/\r\n?/g, "\n").trim();
  return s === "" ? null : s;
}

function toIso(v: unknown): string | null {
  const t = cellText(v);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseApplicationSheet(rows: unknown[][]): ParseResult {
  const empty: ParseResult = { applications: [], skipped: [], unmapped: [], duplicatesInFile: 0, missingRequired: [] };
  const [header, ...body] = rows;
  if (!header) return { ...empty, missingRequired: ["name", "email"] };

  const columns = new Map<Field, number>();
  const unmapped: string[] = [];
  header.forEach((cell, index) => {
    const label = cellText(cell);
    if (!label) return;
    const h = label.toLowerCase();
    const hit = MATCHERS.find((m) => m.test(h));
    if (!hit) unmapped.push(label);
    else if (hit.field !== "ignored" && !columns.has(hit.field)) columns.set(hit.field, index);
  });

  const missingRequired = (["name", "email"] as const).filter((f) => !columns.has(f));
  if (missingRequired.length > 0) return { ...empty, unmapped, missingRequired };

  const get = (r: unknown[], f: Field) => (columns.has(f) ? cellText(r[columns.get(f)!]) : null);
  const byEmail = new Map<string, ParsedApplication>();
  const skipped: ParseResult["skipped"] = [];
  let duplicatesInFile = 0;

  body.forEach((r, i) => {
    const rowNumber = i + 2;
    if (!r.some((c) => cellText(c) !== null)) return;
    const name = cleanApplicantName(get(r, "name") ?? "");
    if (!name) return void skipped.push({ rowNumber, reason: "Missing name" });
    const email = (get(r, "email") ?? "").toLowerCase();
    if (!isPlausibleEmail(email)) return void skipped.push({ rowNumber, reason: "Missing or invalid email" });

    const app: ParsedApplication = {
      rowNumber,
      name,
      email,
      submittedAt: toIso(columns.has("submittedAt") ? r[columns.get("submittedAt")!] : null),
      graduationTerm: get(r, "graduationTerm"),
      major: get(r, "major"),
      howHeard: get(r, "howHeard"),
      essayWhy: get(r, "essayWhy"),
      essayTeamwork: get(r, "essayTeamwork"),
      essayBring: get(r, "essayBring"),
      resumeUrl: get(r, "resumeUrl"),
    };
    const prev = byEmail.get(email);
    if (prev) {
      duplicatesInFile++;
      if ((app.submittedAt ?? "") >= (prev.submittedAt ?? "")) byEmail.set(email, app);
    } else byEmail.set(email, app);
  });

  return { applications: [...byEmail.values()], skipped, unmapped, duplicatesInFile, missingRequired: [] };
}

export function driveEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  const m =
    url.match(/drive\.google\.com\/file\/d\/([\w-]+)/) ?? url.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]+)/);
  return m ? `https://drive.google.com/file/d/${m[1]}/preview` : null;
}

export type PreviewGroup = "new" | "update" | "needs-look";

export interface PreviewRow {
  application: ParsedApplication;
  group: PreviewGroup;
  matchId: string | null;
  candidates: { id: string; name: string; kind: MatchClass }[];
}

export function classifyApplications(apps: ParsedApplication[], existing: MatchableApplicant[]): PreviewRow[] {
  const nameOf = new Map(existing.map((e) => [e.id, e.name]));
  return apps.map((application) => {
    const matches = findMatches({ name: application.name, email: application.email }, existing);
    const best = matches[0];
    if (!best) return { application, group: "new", matchId: null, candidates: [] };
    if (best.kind === "duplicate") return { application, group: "update", matchId: best.applicantId, candidates: [] };
    return {
      application,
      group: "needs-look",
      matchId: null,
      candidates: matches.slice(0, 3).map((m) => ({ id: m.applicantId, name: nameOf.get(m.applicantId) ?? "Unknown", kind: m.kind })),
    };
  });
}

export type ApplicationChoice = { kind: "new" } | { kind: "update"; applicantId: string } | { kind: "skip" };

/** Needs-look rows get no default: a person has to decide them. */
export function defaultChoices(rows: PreviewRow[]): Record<number, ApplicationChoice> {
  const out: Record<number, ApplicationChoice> = {};
  for (const r of rows) {
    if (r.group === "new") out[r.application.rowNumber] = { kind: "new" };
    else if (r.group === "update" && r.matchId) out[r.application.rowNumber] = { kind: "update", applicantId: r.matchId };
  }
  return out;
}

export interface ApplicationCommitRow {
  kind: "new" | "update";
  applicantId?: string;
  name: string;
  email: string;
  major: string | null;
  year: string | null;
  answers: {
    submittedAt: string | null;
    graduationTerm: string | null;
    howHeard: string | null;
    essayWhy: string | null;
    essayTeamwork: string | null;
    essayBring: string | null;
    resumeUrl: string | null;
  };
}

export function buildApplicationCommitRows(rows: PreviewRow[], choices: Record<number, ApplicationChoice>): ApplicationCommitRow[] {
  const out: ApplicationCommitRow[] = [];
  for (const { application: a } of rows) {
    const choice = choices[a.rowNumber];
    if (!choice || choice.kind === "skip") continue;
    out.push({
      kind: choice.kind,
      ...(choice.kind === "update" ? { applicantId: choice.applicantId } : {}),
      name: a.name,
      email: a.email,
      major: a.major,
      year: a.graduationTerm,
      answers: {
        submittedAt: a.submittedAt,
        graduationTerm: a.graduationTerm,
        howHeard: a.howHeard,
        essayWhy: a.essayWhy,
        essayTeamwork: a.essayTeamwork,
        essayBring: a.essayBring,
        resumeUrl: a.resumeUrl,
      },
    });
  }
  return out;
}
