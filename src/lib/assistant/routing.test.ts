import { describe, expect, it } from "vitest";
import { matchShortcut, selectAreas } from "./routing";

describe("selectAreas", () => {
  it("defaults to the cheap common areas", () => {
    expect(selectAreas("hello there")).toEqual(["projects", "tasks", "events"]);
  });
  it("routes recruitment words", () => {
    expect(selectAreas("who are the top applicants by points?")).toContain("recruitment");
  });
  it("adds actions for create/add/remind verbs", () => {
    expect(selectAreas("add a to-do to call the client")).toContain("actions");
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
  it("does not hijack real questions", () => {
    expect(matchShortcut("which of my tasks are blocking the Acme deliverable and why?")).toBeNull();
    expect(matchShortcut("create a task called my tasks")).toBeNull();
  });
});
