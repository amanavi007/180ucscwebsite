import { describe, expect, it } from "vitest";
import { cleanDisplayName, parseAttendeeInput, parseCsvLine } from "./recruit-import";

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
