import { describe, expect, it } from "vitest";
import { CASES, BEHAVIORAL_QUESTIONS } from "./interview-guide";
import { buildTranscriptPrompt, transcriptNotePatch, type TranscriptOutput } from "./interview-transcript";

const bKey = BEHAVIORAL_QUESTIONS[0].key;
const bKey2 = BEHAVIORAL_QUESTIONS[1].key;
const theCase = CASES[0];

const empty: TranscriptOutput = {
  behavioral: [],
  resume: "",
  research: "",
  caseQuestions: "",
  caseApproach: "",
  caseAnswer: "",
  caseAskedIndexes: [],
};

describe("transcriptNotePatch", () => {
  const plan = { behavioralKeys: [bKey, bKey2], caseKey: theCase.key };

  it("keeps every key under the transcript prefix, away from the exec's own notes", () => {
    const patch = transcriptNotePatch({ ...empty, resume: "Led a club" }, plan, "2026-10-20T10:00:00Z");
    for (const key of Object.keys(patch)) expect(key.startsWith("t:")).toBe(true);
    expect(patch["t:b:resume"]).toBe("Led a club");
    expect(patch["t:meta"]).toBe("2026-10-20T10:00:00Z");
  });

  it("fills only the picked behavioral questions and ignores ones that were not picked", () => {
    const other = BEHAVIORAL_QUESTIONS[2].key;
    const patch = transcriptNotePatch(
      { ...empty, behavioral: [{ key: bKey, answer: " Because of the people. " }, { key: other, answer: "stray" }] },
      plan,
      "now",
    );
    expect(patch[`t:b:${bKey}`]).toBe("Because of the people.");
    expect(patch[`t:b:${bKey2}`]).toBe("");
    expect(patch[`t:b:${other}`]).toBeUndefined();
  });

  it("ticks heard clarifying questions and clears the rest", () => {
    const patch = transcriptNotePatch({ ...empty, caseAskedIndexes: [0] }, plan, "now");
    expect(patch[`t:c:asked:${theCase.key}:0`]).toBe("1");
    expect(patch[`t:c:asked:${theCase.key}:1`]).toBe("");
  });

  it("skips the clarifying questions when no case is chosen", () => {
    const patch = transcriptNotePatch({ ...empty, caseAskedIndexes: [0] }, { behavioralKeys: [], caseKey: null }, "now");
    expect(Object.keys(patch).some((k) => k.startsWith("t:c:asked"))).toBe(false);
  });
});

describe("buildTranscriptPrompt", () => {
  it("lists the picked questions, the case questions and the transcript", () => {
    const prompt = buildTranscriptPrompt("Interviewer: hi\nApplicant: hello", { behavioralKeys: [bKey], caseKey: theCase.key });
    expect(prompt).toContain(`key: ${bKey}`);
    expect(prompt).toContain(theCase.ifAsked[0].question);
    expect(prompt).toContain("<transcript>\nInterviewer: hi");
  });
});
