/** Helpers that make a long free-text answer easier to read. They only add line breaks, never change the words. */

export const SHORT_ANSWER_WORDS = 80;

export function wordCount(text: string | null): number {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

// A period after these doesn't end a sentence.
const ABBREVIATIONS = /(?:^|\s)(?:mr|mrs|ms|dr|prof|sr|jr|vs|etc|e\.g|i\.e|u\.s|inc|co|st|no|approx)\.$/i;

/** Splits on sentence ends: . ! or ? followed by a space and a capital letter, quote or digit. */
export function splitSentences(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?]["”')\]]?)\s+(?=["“'(\[]?[A-Z0-9])/);
  const out: string[] = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    // Glue back a split that landed after an abbreviation or a single initial ("J. Smith").
    if (prev && (ABBREVIATIONS.test(prev) || /(?:^|\s)[A-Z]\.$/.test(prev))) out[out.length - 1] = `${prev} ${part}`;
    else if (part) out.push(part);
  }
  return out;
}

const TARGET_WORDS = 55;
const MIN_TAIL_WORDS = 18;

/**
 * Paragraphs for reading. Anything the applicant already broke into paragraphs is kept; a single block is split at
 * sentence ends into chunks of roughly 55 words, without leaving a tiny last paragraph.
 */
export function splitParagraphs(text: string): string[] {
  const written = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  return written.flatMap((p) => (wordCount(p) > TARGET_WORDS * 1.6 ? chunkSentences(p) : [p]));
}

function chunkSentences(paragraph: string): string[] {
  const chunks: string[][] = [[]];
  let words = 0;
  for (const sentence of splitSentences(paragraph)) {
    const n = wordCount(sentence);
    if (words >= TARGET_WORDS) {
      chunks.push([]);
      words = 0;
    }
    chunks[chunks.length - 1].push(sentence);
    words += n;
  }
  const last = chunks[chunks.length - 1];
  if (chunks.length > 1 && wordCount(last.join(" ")) < MIN_TAIL_WORDS) {
    chunks[chunks.length - 2].push(...last);
    chunks.pop();
  }
  return chunks.map((c) => c.join(" "));
}

/** The first sentence on its own, so it can stand out as the answer's opening line. */
export function leadSentence(paragraph: string): { lead: string; rest: string } {
  const [lead, ...rest] = splitSentences(paragraph);
  return { lead: lead ?? paragraph, rest: rest.join(" ") };
}
