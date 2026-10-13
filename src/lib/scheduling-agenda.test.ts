import { describe, expect, it } from "vitest";
import { buildAgenda, groupByDate } from "./scheduling-agenda";

const coffee = [
  { id: "c1", date: "2027-01-13", startTime: "14:00", endTime: "14:30", location: "Cafe", published: true, execId1: "a", exec1Name: "Maya", execId2: null, exec2Name: null, bookingStatus: "booked", applicantName: "Omar" },
  { id: "c2", date: "2027-01-13", startTime: "11:00", endTime: "11:30", location: "Cafe", published: false, execId1: "a", exec1Name: "Maya", execId2: "b", exec2Name: "Tom", bookingStatus: "open", applicantName: null },
] as never;
const interviews = [
  { id: "i1", date: "2027-01-15", startTime: "10:00", endTime: "10:30", published: true, execs: [], bookingStatus: "open", bookingId: null, applicantName: null, applicantEmail: null },
] as never;
const clients = [
  { id: "m1", date: "2027-01-12", startTime: "09:00", endTime: "10:00", published: true, bookingStatus: "booked", bookingId: "b", businessName: "Bikes" },
] as never;

describe("buildAgenda", () => {
  const items = buildAgenda({ coffee, interviews, clients });

  it("merges every kind and sorts by date then time", () => {
    expect(items.map((i) => i.id)).toEqual(["client:m1", "coffee:c2", "coffee:c1", "interview:i1"]);
  });
  it("marks unpublished slots hidden, booked ones booked and the rest open", () => {
    expect(items.find((i) => i.id === "coffee:c2")?.state).toBe("hidden");
    expect(items.find((i) => i.id === "coffee:c1")?.state).toBe("booked");
    expect(items.find((i) => i.id === "interview:i1")?.state).toBe("open");
  });
  it("names who the slot is for, or says it is open", () => {
    expect(items.find((i) => i.id === "coffee:c1")?.title).toBe("Omar");
    expect(items.find((i) => i.id === "interview:i1")?.title).toBe("Open slot");
  });
  it("joins hosts and location, and says when an interview has no panel", () => {
    expect(items.find((i) => i.id === "coffee:c2")?.detail).toBe("Maya and Tom · Cafe");
    expect(items.find((i) => i.id === "interview:i1")?.detail).toBe("No panel yet");
  });
});

describe("mine", () => {
  it("flags coffee chats you host, interviews you are on, and client calls when you are on the panel", () => {
    const items = buildAgenda({ coffee, interviews, clients, currentExecId: "a", clientPanelExecIds: ["a", "x", "y"] });
    expect(items.find((i) => i.id === "coffee:c1")?.mine).toBe(true);
    expect(items.find((i) => i.id === "client:m1")?.mine).toBe(true);
    expect(items.find((i) => i.id === "interview:i1")?.mine).toBe(false);
  });
  it("flags nothing when no one is signed in", () => {
    expect(buildAgenda({ coffee, interviews, clients }).some((i) => i.mine)).toBe(false);
  });
});

describe("groupByDate", () => {
  it("groups consecutive items that share a date", () => {
    const groups = groupByDate(buildAgenda({ coffee, interviews, clients }));
    expect(groups.map((g) => [g.date, g.items.length])).toEqual([
      ["2027-01-12", 1],
      ["2027-01-13", 2],
      ["2027-01-15", 1],
    ]);
  });
});
