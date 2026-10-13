import { describe, expect, it } from "vitest";
import { cleanApplicantName, driveEmbedUrl, parseApplicationSheet } from "./recruit-applications";

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
