import { describe, expect, it } from "vitest";
import {
  buildApplicationCommitRows,
  classifyApplications,
  cleanApplicantName,
  defaultChoices,
  diffAgainst,
  driveEmbedUrl,
  parseApplicationSheet,
  type ParsedApplication,
} from "./recruit-applications";

const HEADER = [
  "Timestamp",
  "Email Address",
  "First, Last Name",
  "Please indicate your graduation term. ",
  "Major/Minor",
  "How did you hear about 180 Degrees Consulting UCSC?",
  "Why are you interested in joining 180 Degrees Consulting? (250-word limit)",
  "Describe a time you worked on a project with a team. Highlight any challenges (250-word limit)",
  "We find that we are best able to carry out comprehensive consulting projects when we have a team made up of a diverse group of individuals with broad skills",
  "Please link your resume through Google Drive below.",
  "Please indicate your availability for an interview below. [Monday]",
  "If none of the above times work for you, please indicate a date and time that you are available.",
];

function row(over: Partial<Record<number, unknown>> = {}): unknown[] {
  const base: unknown[] = [
    "2026-09-30T22:31:01.878Z", "vibalamu@ucsc.edu", "Vinesh, Balamurugan", "Spring 2028", "Computer Engineering",
    "Referral", "Why text", "Team text", "Bring text", "https://drive.google.com/file/d/ABC_1-x/view", "1:00 PM", null,
  ];
  for (const [i, v] of Object.entries(over)) base[Number(i)] = v;
  return base;
}

describe("cleanApplicantName", () => {
  it("turns the form's 'First, Last' into 'First Last' without flipping", () => {
    expect(cleanApplicantName("Vinesh, Balamurugan")).toBe("Vinesh Balamurugan");
  });
  it("passes plain names through and collapses spaces", () => {
    expect(cleanApplicantName("  Lucia   Lim ")).toBe("Lucia Lim");
  });
});

describe("parseApplicationSheet", () => {
  it("maps the real headers and ignores availability columns", () => {
    const r = parseApplicationSheet([HEADER, row()]);
    expect(r.missingRequired).toEqual([]);
    expect(r.unmapped).toEqual([]);
    expect(r.applications).toEqual([
      {
        rowNumber: 2, name: "Vinesh Balamurugan", email: "vibalamu@ucsc.edu",
        submittedAt: "2026-09-30T22:31:01.878Z", graduationTerm: "Spring 2028", major: "Computer Engineering",
        howHeard: "Referral", essayWhy: "Why text", essayTeamwork: "Team text", essayBring: "Bring text",
        resumeUrl: "https://drive.google.com/file/d/ABC_1-x/view",
      },
    ]);
  });

  it("accepts Date cells for the timestamp", () => {
    const r = parseApplicationSheet([HEADER, row({ 0: new Date("2026-10-01T13:25:32.368Z") })]);
    expect(r.applications[0].submittedAt).toBe("2026-10-01T13:25:32.368Z");
  });

  it("reports columns it does not recognise instead of dropping them silently", () => {
    const r = parseApplicationSheet([[...HEADER, "Pronouns"], [...row(), "they/them"]]);
    expect(r.unmapped).toEqual(["Pronouns"]);
  });

  it("fails clearly when the name or email column is missing", () => {
    const r = parseApplicationSheet([["Timestamp", "Major"], ["x", "y"]]);
    expect(r.missingRequired).toEqual(["name", "email"]);
    expect(r.applications).toEqual([]);
  });

  it("skips rows without a usable name or email, with the sheet row number", () => {
    const r = parseApplicationSheet([HEADER, row({ 2: "" }), row({ 1: "not-an-email" }), row()]);
    expect(r.skipped).toEqual([
      { rowNumber: 2, reason: "Missing name" },
      { rowNumber: 3, reason: "Missing or invalid email" },
    ]);
    expect(r.applications).toHaveLength(1);
  });

  it("lowercases and trims emails, and keeps the latest of a double submission", () => {
    const r = parseApplicationSheet([
      HEADER,
      row({ 1: " Lucia@UCSC.edu ", 0: "2026-10-01T10:00:00Z", 6: "first" }),
      row({ 1: "lucia@ucsc.edu", 0: "2026-10-02T10:00:00Z", 6: "second" }),
    ]);
    expect(r.applications).toHaveLength(1);
    expect(r.applications[0].email).toBe("lucia@ucsc.edu");
    expect(r.applications[0].essayWhy).toBe("second");
    expect(r.duplicatesInFile).toBe(1);
  });

  it("reports a double submission with identical answers as identical", () => {
    const r = parseApplicationSheet([
      HEADER,
      row({ 0: "2026-10-01T10:00:00Z", 6: "Same  text" }),
      row({ 0: "2026-10-02T10:00:00Z", 6: "Same text " }),
    ]);
    expect(r.duplicateGroups).toHaveLength(1);
    expect(r.duplicateGroups[0].submissions).toHaveLength(2);
    expect(r.duplicateGroups[0].differing).toEqual([]);
    expect(r.duplicateGroups[0].keptRow).toBe(3);
  });

  it("lists which fields differ between a person's submissions", () => {
    const r = parseApplicationSheet([
      HEADER,
      row({ 0: "2026-10-01T10:00:00Z", 4: "Math", 6: "old essay" }),
      row({ 0: "2026-10-02T10:00:00Z", 4: "Economics", 6: "old essay" }),
    ]);
    expect(r.duplicateGroups[0].differing).toEqual(["major"]);
  });

  it("has no duplicate groups when everyone submitted once", () => {
    expect(parseApplicationSheet([HEADER, row(), row({ 1: "b@ucsc.edu" })]).duplicateGroups).toEqual([]);
  });

  it("keeps multi-line essays intact", () => {
    const r = parseApplicationSheet([HEADER, row({ 6: "line1\r\nline2 " })]);
    expect(r.applications[0].essayWhy).toBe("line1\nline2");
  });

  it("ignores fully blank rows without reporting them", () => {
    const r = parseApplicationSheet([HEADER, [], row()]);
    expect(r.skipped).toEqual([]);
  });
});

describe("driveEmbedUrl", () => {
  it("builds a preview url from file links", () => {
    expect(driveEmbedUrl("https://drive.google.com/file/d/ABC_1-x/view?usp=sharing")).toBe(
      "https://drive.google.com/file/d/ABC_1-x/preview",
    );
    expect(driveEmbedUrl("https://drive.google.com/open?id=ABC_1-x")).toBe("https://drive.google.com/file/d/ABC_1-x/preview");
  });
  it("returns null for anything else", () => {
    expect(driveEmbedUrl("https://example.com/resume.pdf")).toBeNull();
    expect(driveEmbedUrl(null)).toBeNull();
  });
});

const app = (over: Partial<ParsedApplication> = {}): ParsedApplication => ({
  rowNumber: 2, name: "Lucia Lim", email: "lumlim@ucsc.edu", submittedAt: null, graduationTerm: "Spring 2029",
  major: "BME", howHeard: null, essayWhy: "w", essayTeamwork: "t", essayBring: "b",
  resumeUrl: "https://drive.google.com/file/d/X/view", ...over,
});

describe("classifyApplications", () => {
  const existing = [
    { id: "e1", name: "Lucia Lim", email: "lumlim@ucsc.edu", aliases: [] },
    { id: "e2", name: "Jessica Kim", email: null, aliases: [] },
  ];
  it("same email means update", () => {
    const [r] = classifyApplications([app()], existing);
    expect(r).toMatchObject({ group: "update", matchId: "e1" });
  });
  it("same name but different email needs a look", () => {
    const [r] = classifyApplications([app({ email: "other@ucsc.edu" })], existing);
    expect(r.group).toBe("needs-look");
    expect(r.candidates[0]).toMatchObject({ id: "e1" });
  });
  it("no match is new, and Jessica Kim does not match Jessica Kimball", () => {
    const [r] = classifyApplications([app({ name: "Jessica Kimball", email: "jk@ucsc.edu" })], existing);
    expect(r.group).toBe("new");
  });
});

describe("buildApplicationCommitRows", () => {
  const rows = classifyApplications(
    [app(), app({ rowNumber: 3, name: "New Person", email: "np@ucsc.edu" }), app({ rowNumber: 4, name: "Lucia Lim", email: "x@ucsc.edu" })],
    [{ id: "e1", name: "Lucia Lim", email: "lumlim@ucsc.edu", aliases: [] }],
  );
  it("defaults: update for matches, new for new, nothing for needs-look", () => {
    expect(defaultChoices(rows)).toEqual({ 2: { kind: "update", applicantId: "e1" }, 3: { kind: "new" } });
  });
  it("builds commit rows from choices and drops skips and undecided rows", () => {
    const out = buildApplicationCommitRows(rows, { ...defaultChoices(rows), 4: { kind: "skip" } });
    expect(out.map((r) => [r.kind, r.applicantId ?? null, r.email])).toEqual([
      ["update", "e1", "lumlim@ucsc.edu"],
      ["new", null, "np@ucsc.edu"],
    ]);
    expect(out[0]).toMatchObject({ year: "Spring 2029", major: "BME", answers: { essayWhy: "w", resumeUrl: "https://drive.google.com/file/d/X/view" } });
  });
  it("leaves out needs-look rows that were never decided", () => {
    const out = buildApplicationCommitRows(rows, defaultChoices(rows));
    expect(out.map((r) => r.email)).toEqual(["lumlim@ucsc.edu", "np@ucsc.edu"]);
  });
});

describe("diffAgainst", () => {
  it("marks nothing when the text is the same, ignoring spacing", () => {
    expect(diffAgainst("a  b c", "a b c ")).toEqual([{ text: "a b c", changed: false }]);
  });
  it("marks only the words that differ", () => {
    expect(diffAgainst("we love data science", "we like data science")).toEqual([
      { text: "we", changed: false },
      { text: "love", changed: true },
      { text: "data science", changed: false },
    ]);
  });
  it("marks added words and treats a missing other as all changed", () => {
    expect(diffAgainst("a b c", "a c")).toEqual([
      { text: "a", changed: false },
      { text: "b", changed: true },
      { text: "c", changed: false },
    ]);
    expect(diffAgainst("a b", null)).toEqual([{ text: "a b", changed: true }]);
  });
});
