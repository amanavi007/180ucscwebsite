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

export type CompareField = "name" | "graduationTerm" | "major" | "howHeard" | "essayWhy" | "essayTeamwork" | "essayBring" | "resumeUrl";

export const COMPARE_FIELDS: { key: CompareField; label: string; long?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "graduationTerm", label: "Graduation" },
  { key: "major", label: "Major" },
  { key: "howHeard", label: "How they heard" },
  { key: "resumeUrl", label: "Resume link" },
  { key: "essayWhy", label: "Why they want to join", long: true },
  { key: "essayTeamwork", label: "A time they worked on a team", long: true },
  { key: "essayBring", label: "What they would bring", long: true },
];

/** Everyone who submitted the form more than once, with every submission kept so a person can compare them. */
export interface DuplicateGroup {
  email: string;
  /** In sheet order. */
  submissions: ParsedApplication[];
  /** Row number of the submission the import uses unless someone picks another. */
  keptRow: number;
  /** Fields whose answers aren't the same across submissions (timestamps always differ and don't count). */
  differing: CompareField[];
}

export interface ParseResult {
  applications: ParsedApplication[];
  duplicateGroups: DuplicateGroup[];
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

/** Whitespace and blank-vs-missing never count as a difference. */
function comparable(v: string | null): string {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

export interface DiffSegment {
  text: string;
  changed: boolean;
}

/** Word-level diff of `text` against `other`: words that don't appear in the same place in `other` are marked changed. */
export function diffAgainst(text: string | null, other: string | null): DiffSegment[] {
  const a = comparable(text).split(" ").filter(Boolean);
  const b = comparable(other).split(" ").filter(Boolean);
  // Longest common subsequence table; essays are a few hundred words so this stays small.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffSegment[] = [];
  const push = (word: string, changed: boolean) => {
    const last = out[out.length - 1];
    if (last && last.changed === changed) last.text += ` ${word}`;
    else out.push({ text: word, changed });
  };
  let i = 0;
  let j = 0;
  while (i < a.length) {
    if (j < b.length && a[i] === b[j]) {
      push(a[i], false);
      i++;
      j++;
    } else if (j < b.length && lcs[i][j + 1] >= lcs[i + 1][j]) j++;
    else {
      push(a[i], true);
      i++;
    }
  }
  return out;
}

export function parseApplicationSheet(rows: unknown[][]): ParseResult {
  const empty: ParseResult = { applications: [], duplicateGroups: [], skipped: [], unmapped: [], duplicatesInFile: 0, missingRequired: [] };
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
  const submissionsByEmail = new Map<string, ParsedApplication[]>();
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
    submissionsByEmail.set(email, [...(submissionsByEmail.get(email) ?? []), app]);
    const prev = byEmail.get(email);
    if (prev) {
      duplicatesInFile++;
      if ((app.submittedAt ?? "") >= (prev.submittedAt ?? "")) byEmail.set(email, app);
    } else byEmail.set(email, app);
  });

  const duplicateGroups: DuplicateGroup[] = [];
  for (const [email, submissions] of submissionsByEmail) {
    if (submissions.length < 2) continue;
    duplicateGroups.push({
      email,
      submissions,
      keptRow: byEmail.get(email)!.rowNumber,
      differing: COMPARE_FIELDS.map((f) => f.key).filter((key) => new Set(submissions.map((a) => comparable(a[key]))).size > 1),
    });
  }

  return { applications: [...byEmail.values()], duplicateGroups, skipped, unmapped, duplicatesInFile, missingRequired: [] };
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
