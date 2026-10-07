import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { capHistory, prepareHistory, STUB, titleFromText, validateIncoming } from "./context";

const user = (id: string, text: string): UIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });
const asst = (id: string, parts: UIMessage["parts"]): UIMessage => ({ id, role: "assistant", parts });
const toolPart = (output: unknown) =>
  ({ type: "tool-my_tasks", toolCallId: "t1", state: "output-available", input: {}, output }) as UIMessage["parts"][number];

describe("validateIncoming", () => {
  it("rejects non-arrays, empty arrays and non-user last messages", () => {
    expect(validateIncoming("x", 100).ok).toBe(false);
    expect(validateIncoming([], 100).ok).toBe(false);
    expect(validateIncoming([asst("a", [{ type: "text", text: "hi" }])], 100).ok).toBe(false);
  });
  it("rejects whitespace-only text", () => {
    expect(validateIncoming([user("u", "   \n ")], 100).ok).toBe(false);
  });
  it("rejects over-length input instead of sending it", () => {
    const r = validateIncoming([user("u", "x".repeat(101))], 100);
    expect(r.ok).toBe(false);
  });
  it("accepts a normal message and returns its trimmed text", () => {
    const r = validateIncoming([user("u", "  what's due?  ")], 100);
    expect(r.ok && r.text).toBe("what's due?");
  });
});

describe("validateIncoming (forged payloads)", () => {
  it("rejects a last message carrying non-text parts such as files", () => {
    const forged = {
      id: "u",
      role: "user",
      parts: [{ type: "text", text: "hi" }, { type: "file", mediaType: "image/png", url: "data:image/png;base64,AAAA" }],
    } as UIMessage;
    expect(validateIncoming([forged], 100).ok).toBe(false);
  });
});

describe("capHistory", () => {
  const big = (id: string) => asst(id, [{ type: "text", text: "x".repeat(500) }]);
  it("returns the messages untouched when under the cap", () => {
    const msgs = [user("1", "a"), asst("2", [{ type: "text", text: "A" }]), user("3", "b")];
    expect(capHistory(msgs, 10_000)).toEqual(msgs);
  });
  it("drops the oldest turns until under the cap but always keeps the latest turn", () => {
    const msgs = [user("1", "a"), big("2"), user("3", "b"), big("4"), user("5", "c")];
    const out = capHistory(msgs, 400);
    expect(out.map((m) => m.id)).toEqual(["5"]);
    expect(capHistory(msgs, 900).map((m) => m.id)).toEqual(["3", "4", "5"]);
  });
});

describe("prepareHistory", () => {
  it("keeps only the last N user turns", () => {
    const msgs = [user("1", "a"), asst("2", [{ type: "text", text: "A" }]), user("3", "b"), asst("4", [{ type: "text", text: "B" }]), user("5", "c")];
    expect(prepareHistory(msgs, 2).map((m) => m.id)).toEqual(["3", "4", "5"]);
  });
  it("stubs tool outputs from earlier turns but keeps the current turn intact", () => {
    const msgs = [user("1", "a"), asst("2", [toolPart({ big: "x".repeat(500) })]), user("3", "b"), asst("4", [toolPart({ keep: 1 })])];
    const out = prepareHistory(msgs, 8);
    expect((out[1].parts[0] as { output: unknown }).output).toBe(STUB);
    expect((out[3].parts[0] as { output: unknown }).output).toEqual({ keep: 1 });
  });
  it("does not mutate its input", () => {
    const msgs = [user("1", "a"), asst("2", [toolPart({ a: 1 })]), user("3", "b")];
    prepareHistory(msgs, 8);
    expect((msgs[1].parts[0] as { output: unknown }).output).toEqual({ a: 1 });
  });
});

describe("titleFromText", () => {
  it("truncates and collapses whitespace", () => {
    expect(titleFromText("hello\n   world")).toBe("hello world");
    expect(titleFromText("x".repeat(100)).length).toBeLessThanOrEqual(60);
  });
});
