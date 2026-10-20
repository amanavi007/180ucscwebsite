import { describe, expect, it } from "vitest";
import { BEHAVIORAL_QUESTIONS } from "./interview-guide";
import { SUGGEST_MAX, buildSuggestPrompt, cleanSuggestions } from "./interview-suggest";

describe("interview question suggestions", () => {
  it("lists every question and the application answers in the prompt", () => {
    const prompt = buildSuggestPrompt([{ label: "Teamwork", text: "I led a robotics team." }]);
    for (const q of BEHAVIORAL_QUESTIONS) expect(prompt).toContain(q.key);
    expect(prompt).toContain("I led a robotics team.");
  });

  it("drops unknown and repeated keys and caps the list", () => {
    const keys = BEHAVIORAL_QUESTIONS.map((q) => q.key);
    const cleaned = cleanSuggestions({
      suggestions: [
        { key: "nope", reason: "x" },
        { key: keys[0], reason: "  first  " },
        { key: keys[0], reason: "again" },
        ...keys.slice(1, 8).map((key) => ({ key, reason: "r" })),
      ],
    });
    expect(cleaned[0]).toEqual({ key: keys[0], reason: "first" });
    expect(cleaned).toHaveLength(SUGGEST_MAX);
  });
});
