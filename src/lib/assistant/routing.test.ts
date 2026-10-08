import { describe, expect, it } from "vitest";
import { matchShortcut, selectAreas } from "./routing";

describe("selectAreas", () => {
  const READS = ["projects", "tasks", "events", "recruitment", "attendance", "people", "wiki", "guide", "knowledge", "scheduling", "links", "notifications", "admin", "search"];
  it("always offers every read tool, whatever the wording", () => {
    for (const q of ["hello there", "", "what other things should i pay attention to when formatting my slides", "who is my PM", "how many people applied", "what about tomorrow"]) {
      expect(selectAreas(q)).toEqual(expect.arrayContaining(READS));
    }
  });
  it("offers write tools only for action wording", () => {
    for (const q of ["add a to-do to call the client", "mark the memo task done", "make Priya a project manager", "push it to next wednesday", "cancel Jo Park's interview"]) {
      expect(selectAreas(q)).toContain("actions");
    }
    for (const q of ["whens my next coffee chat", "who is my PM", "what font should i use on my slides", "what needs attention"]) {
      expect(selectAreas(q)).not.toContain("actions");
    }
  });
  it("keeps write tools for a short reply right after a proposal", () => {
    expect(selectAreas("the Acme one", { recentWrite: true })).toContain("actions");
    expect(selectAreas("friday", { recentWrite: true })).toContain("actions");
    expect(selectAreas("the Acme one", { recentWrite: false })).not.toContain("actions");
  });
});

describe("matchShortcut", () => {
  it("matches exact short intents", () => {
    expect(matchShortcut("my tasks")).toBe("my_open_tasks");
    expect(matchShortcut("What's due?")).toBe("my_open_tasks");
    expect(matchShortcut("upcoming events")).toBe("upcoming_events");
  });
  it("matches the other common one-liners", () => {
    expect(matchShortcut("who has the worst attendance right now")).toBe("attendance_report");
    expect(matchShortcut("Attendance report")).toBe("attendance_report");
    expect(matchShortcut("my attendance?")).toBe("my_attendance");
    expect(matchShortcut("my projects")).toBe("my_projects");
    expect(matchShortcut("all projects")).toBe("quarter_projects");
    expect(matchShortcut("top applicants")).toBe("top_applicants");
  });
  it("does not hijack longer or conditional versions", () => {
    expect(matchShortcut("who has the worst attendance on the Acme team and why")).toBeNull();
    expect(matchShortcut("show my projects that are at risk because of delays")).toBeNull();
  });
  it("does not hijack real questions", () => {
    expect(matchShortcut("which of my tasks are blocking the Acme deliverable and why?")).toBeNull();
    expect(matchShortcut("create a task called my tasks")).toBeNull();
  });
});
