import { describe, expect, it } from "vitest";
import { matchShortcut, selectAreas } from "./routing";

describe("selectAreas", () => {
  it("defaults to the cheap common areas", () => {
    expect(selectAreas("hello there")).toEqual(["projects", "tasks", "events", "search", "wiki"]);
  });
  it("routes recruitment words", () => {
    expect(selectAreas("who are the top applicants by points?")).toContain("recruitment");
  });
  it("adds actions for create/add/remind verbs", () => {
    expect(selectAreas("add a to-do to call the client")).toContain("actions");
  });
  it("routes attendance and people questions", () => {
    expect(selectAreas("who has the worst attendance right now")).toContain("attendance");
    expect(selectAreas("who is on the Acme team?")).toContain("people");
  });
  it("sends how-to questions to the guide", () => {
    expect(selectAreas("how do I build an issue tree?")).toContain("wiki");
    expect(selectAreas("what should I do next on my project")).toContain("guide");
  });
  it("routes write verbs to actions and scheduling words to scheduling", () => {
    expect(selectAreas("mark the memo task done")).toContain("actions");
    expect(selectAreas("who has an interview booked")).toContain("scheduling");
  });
  it("never returns an empty list", () => {
    expect(selectAreas("").length).toBeGreaterThan(0);
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
