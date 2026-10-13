/**
 * A criterion's description spells out what each score means, one line per score ("3 = Readable, reasoning is partly clear").
 * The older single-line form ("1 = vague, 5 = clear") still parses. Anything else is plain text with no per-score meaning.
 */
export function parseLevels(description: string): Map<number, string> {
  const levels = new Map<number, string>();
  for (const line of description.split(/\r?\n/)) {
    for (const part of line.split(/,\s*(?=\d+\s*=)/)) {
      const m = part.match(/^\s*(\d+)\s*=\s*(.+?)\s*$/);
      if (m) levels.set(Number(m[1]), m[2]);
    }
  }
  return levels;
}

/** Which application answer a criterion is read from, so the reader can tick an answer once its criterion is scored. */
export const ANSWER_KEYS = ["why", "teamwork", "bring", "resume"] as const;
export type AnswerKey = (typeof ANSWER_KEYS)[number];

export const ANSWER_LABELS: Record<AnswerKey, string> = {
  why: "Why they want to join",
  teamwork: "A time they worked on a team",
  bring: "What they would bring",
  resume: "Resume",
};

export function isAnswerKey(v: unknown): v is AnswerKey {
  return typeof v === "string" && (ANSWER_KEYS as readonly string[]).includes(v);
}

/** Splits a free-text answer into paragraphs so long answers don't read as one block. */
export function splitParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [];
}

export const SHORT_ANSWER_WORDS = 80;

export function wordCount(text: string | null): number {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}
