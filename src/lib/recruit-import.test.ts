import { describe, expect, it } from "vitest";
import {
  buildCommitRows,
  cleanDisplayName,
  defaultActions,
  parseAttendeeInput,
  parseCsvLine,
  reviewImport,
  summarizeActions,
  type ParsedAttendee,
  type ReviewContext,
} from "./recruit-import";
import type { MatchableApplicant } from "./recruit-matching";

describe("parseCsvLine", () => {
  it("splits simple fields", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });
  it("keeps commas inside quotes and unescapes doubled quotes", () => {
    expect(parseCsvLine('"Kim, Jessica","say ""hi""",x')).toEqual(["Kim, Jessica", 'say "hi"', "x"]);
  });
  it("trims whitespace around fields", () => {
    expect(parseCsvLine(" a , b ")).toEqual(["a", "b"]);
  });
});

describe("parseAttendeeInput — plain lists", () => {
  it("parses one name per line and ignores blanks", () => {
    expect(parseAttendeeInput("Jessica Kim\n\n  Daniel Ortiz  \n")).toEqual([
      { rawName: "Jessica Kim", email: null, minutes: null },
      { rawName: "Daniel Ortiz", email: null, minutes: null },
    ]);
  });
  it("parses 'name, email' lines", () => {
    expect(parseAttendeeInput("Jessica Kim, JKim@ucsc.edu")).toEqual([
      { rawName: "Jessica Kim", email: "jkim@ucsc.edu", minutes: null },
    ]);
  });
  it("treats 'Last, First' as a name, not name+email", () => {
    expect(parseAttendeeInput("Kim, Jessica")).toEqual([{ rawName: "Kim, Jessica", email: null, minutes: null }]);
  });
  it("accepts a bare email", () => {
    expect(parseAttendeeInput("jess.kim@ucsc.edu")).toEqual([
      { rawName: "jess kim", email: "jess.kim@ucsc.edu", minutes: null },
    ]);
  });
  it("accepts tab-separated name and email (spreadsheet paste)", () => {
    expect(parseAttendeeInput("Jessica Kim\tjkim@ucsc.edu")).toEqual([
      { rawName: "Jessica Kim", email: "jkim@ucsc.edu", minutes: null },
    ]);
  });
  it("returns [] for empty input", () => {
    expect(parseAttendeeInput("  \n \r\n")).toEqual([]);
  });
  it("merges repeated names", () => {
    expect(parseAttendeeInput("Jessica Kim\njessica kim")).toHaveLength(1);
  });
});

const ZOOM = [
  "﻿Topic,ID,Host,Duration (minutes),Start time,End time,Participants",
  "Info Session,123456789,Exec,62,10/14/2026 7:00,10/14/2026 8:02,40",
  "",
  "Name (original name),User Email,Join time,Leave time,Duration (minutes),Guest,In Waiting Room",
  '"Kim, Jessica",jkim@ucsc.edu,10/14/2026 7:01,10/14/2026 7:30,29,No,No',
  "Jessica Kim (she/her),jkim@ucsc.edu,10/14/2026 7:35,10/14/2026 8:02,27,No,No",
  "iPhone,,10/14/2026 7:05,10/14/2026 7:08,3,Yes,No",
  "Daniel Ortiz,dortiz@ucsc.edu,10/14/2026 7:00,10/14/2026 8:02,62,No,No",
].join("\r\n");

describe("parseAttendeeInput — Zoom reports", () => {
  const rows = parseAttendeeInput(ZOOM);

  it("skips metadata lines above the header and strips the BOM", () => {
    expect(rows.map((r) => r.rawName)).not.toContain("Info Session");
    expect(rows.length).toBe(3);
  });
  it("sums minutes for the same person across rejoins (matched by email)", () => {
    const jessica = rows.find((r) => r.email === "jkim@ucsc.edu");
    expect(jessica?.minutes).toBe(56);
  });
  it("keeps attendees without an email", () => {
    expect(rows.find((r) => r.rawName === "iPhone")).toMatchObject({ email: null, minutes: 3 });
  });
  it("reads a registration-style First/Last Name header", () => {
    const csv = "First Name,Last Name,Email\nJessica,Kim,jkim@ucsc.edu\nDaniel,Ortiz,";
    expect(parseAttendeeInput(csv)).toEqual([
      { rawName: "Jessica Kim", email: "jkim@ucsc.edu", minutes: null },
      { rawName: "Daniel Ortiz", email: null, minutes: null },
    ]);
  });
});

describe("cleanDisplayName", () => {
  it("removes pronouns and device suffixes and flips Last, First", () => {
    expect(cleanDisplayName("Kim, Jessica (she/her)")).toBe("Jessica Kim");
    expect(cleanDisplayName("Jessica Kim - iPhone")).toBe("Jessica Kim");
  });
  it("title-cases all-lowercase or all-uppercase names only", () => {
    expect(cleanDisplayName("jessica kim")).toBe("Jessica Kim");
    expect(cleanDisplayName("JESSICA KIM")).toBe("Jessica Kim");
    expect(cleanDisplayName("Jessica McKim")).toBe("Jessica McKim");
  });
});

const applicants: MatchableApplicant[] = [
  { id: "a1", name: "Jessica Kim", email: "jkim@ucsc.edu", aliases: [] },
  { id: "a2", name: "Daniel Ortiz", email: null, aliases: ["danny ortiz"] },
  { id: "a3", name: "Aisha Rahman", email: null, aliases: [] },
];

const ctx = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  applicants,
  ignoredNames: new Set(),
  memberNames: new Set(),
  awardedApplicantIds: new Set(),
  minMinutes: 10,
  ...over,
});

const att = (rawName: string, over: Partial<ParsedAttendee> = {}): ParsedAttendee => ({
  rawName,
  email: null,
  minutes: null,
  ...over,
});

describe("reviewImport", () => {
  it("matches an exact normalized name", () => {
    const [row] = reviewImport([att("Kim, Jessica (she/her)")], ctx());
    expect(row).toMatchObject({ group: "matched", applicantId: "a1" });
  });
  it("matches by email even when the name differs", () => {
    const [row] = reviewImport([att("J K", { email: "jkim@ucsc.edu" })], ctx());
    expect(row).toMatchObject({ group: "matched", applicantId: "a1" });
  });
  it("matches through a saved alias", () => {
    const [row] = reviewImport([att("Danny Ortiz")], ctx());
    expect(row).toMatchObject({ group: "matched", applicantId: "a2" });
  });
  it("sends a fuzzy match to 'needs-look' with candidates and no default applicant", () => {
    const [row] = reviewImport([att("Jess K.")], ctx());
    expect(row.group).toBe("needs-look");
    expect(row.applicantId).toBeNull();
    expect(row.candidates[0].applicantId).toBe("a1");
  });
  it("marks an unknown person as new", () => {
    expect(reviewImport([att("Marcus Lee")], ctx())[0].group).toBe("new");
  });
  it("ignores short Zoom stays but keeps people with no minutes", () => {
    const rows = reviewImport([att("Marcus Lee", { minutes: 3 }), att("Priya Natarajan", { minutes: null })], ctx());
    expect(rows[0]).toMatchObject({ group: "ignored", reason: "Stayed 3 min" });
    expect(rows[1].group).toBe("new");
  });
  it("a minMinutes of 0 disables the filter", () => {
    expect(reviewImport([att("Marcus Lee", { minutes: 1 })], ctx({ minMinutes: 0 }))[0].group).toBe("new");
  });
  it("ignores names on the ignore list", () => {
    const rows = reviewImport([att("Zoom Room 1")], ctx({ ignoredNames: new Set(["zoom room"]) }));
    expect(rows[0]).toMatchObject({ group: "ignored", reason: "On your ignore list" });
  });
  it("ignores names that look like portal members, unless they match an applicant", () => {
    const c = ctx({ memberNames: new Set(["sam exec", "jessica kim"]) });
    expect(reviewImport([att("Sam Exec")], c)[0]).toMatchObject({ group: "ignored", reason: "Looks like a member or exec" });
    expect(reviewImport([att("Jessica Kim")], c)[0].group).toBe("matched");
  });
  it("skips applicants who already have points for the event", () => {
    const [row] = reviewImport([att("Jessica Kim")], ctx({ awardedApplicantIds: new Set(["a1"]) }));
    expect(row).toMatchObject({ group: "already", applicantId: "a1" });
  });
  it("never lets two list names award the same applicant", () => {
    const rows = reviewImport([att("Jessica Kim"), att("Kim, Jessica")], ctx());
    expect(rows[0].group).toBe("matched");
    expect(rows[1].group).toBe("needs-look");
  });
  it("flags an empty name with no email as ignored", () => {
    expect(reviewImport([att("  ")], ctx())[0]).toMatchObject({ group: "ignored", reason: "No name" });
  });
  it("gives each row a stable key", () => {
    expect(reviewImport([att("A One"), att("B Two")], ctx()).map((r) => r.key)).toEqual(["0", "1"]);
  });
});

describe("actions and commit rows", () => {
  const rows = reviewImport(
    [att("Jessica Kim"), att("Jess K."), att("Marcus Lee"), att("Zoom Room 1", { minutes: 1 }), att("Daniel Ortiz")],
    ctx({ awardedApplicantIds: new Set(["a2"]) }),
  );

  it("defaults: award matched, add new, skip everything uncertain or ignored", () => {
    const actions = defaultActions(rows);
    expect(actions["0"]).toEqual({ action: "award", applicantId: "a1" });
    expect(actions["1"]).toEqual({ action: "skip" });
    expect(actions["2"]).toEqual({ action: "new" });
    expect(actions["3"]).toEqual({ action: "skip" });
    expect(actions["4"]).toEqual({ action: "skip" }); // already awarded
  });

  it("summarizes, counting unresolved 'needs a look' rows", () => {
    expect(summarizeActions(rows, defaultActions(rows))).toEqual({ award: 1, create: 1, skip: 3, unresolved: 1 });
  });

  it("builds commit rows, saving an alias only when the list name differs", () => {
    const actions = defaultActions(rows);
    actions["1"] = { action: "award", applicantId: "a1" }; // exec confirmed "Jess K." = Jessica
    actions["3"] = { action: "ignore" };
    expect(buildCommitRows(rows, actions, applicants)).toEqual([
      { kind: "existing", applicantId: "a1", alias: null },
      { kind: "existing", applicantId: "a1", alias: "jess k" },
      { kind: "new", name: "Marcus Lee", email: null },
      { kind: "ignore", alias: "zoom room" },
    ]);
  });

  it("omits skipped rows entirely", () => {
    expect(buildCommitRows(rows, defaultActions(rows), applicants)).toEqual([
      { kind: "existing", applicantId: "a1", alias: null },
      { kind: "new", name: "Marcus Lee", email: null },
    ]);
  });
});
