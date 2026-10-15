export interface DocFacts {
  wordCount: number;
  urls: string[];
  citationCount: number;
  hasReferencesHeading: boolean;
  headings: string[];
}

export interface SlideFact {
  number: number;
  wordCount: number;
  hasSource: boolean;
  urls: string[];
}

export interface SlideFacts {
  slideCount: number;
  slides: SlideFact[];
  /** 1-based numbers of slides with no source-looking text. The model decides which are exempt (title, divider). */
  slidesMissingSource: number[];
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const AUTHOR_YEAR_RE = /\(\s*[A-Z][^()]{1,60}?,?\s*(?:19|20)\d{2}[a-z]?\s*\)/g;
const NUMBERED_RE = /\[\d{1,3}\]/g;
const SOURCE_LINE_RE = /(^|\n)\s*(sources?|references?|via)\s*[:\-–—]/i;

export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, "")))];
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function citationCount(text: string): number {
  return (text.match(AUTHOR_YEAR_RE)?.length ?? 0) + (text.match(NUMBERED_RE)?.length ?? 0);
}

export function isEffectivelyEmpty(text: string): boolean {
  return words(text) < 20;
}

export function docFacts(text: string): DocFacts {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // A heading here is a short line with no terminal period (Google's text export drops heading styles).
  const headings = lines.filter((l) => l.length <= 80 && !/[.!?]$/.test(l) && words(l) <= 10).slice(0, 40);
  return {
    wordCount: words(text),
    urls: extractUrls(text),
    citationCount: citationCount(text),
    hasReferencesHeading: lines.some((l) => /^(references|sources|bibliography|works cited)\b/i.test(l)),
    headings,
  };
}

export function slideFacts(slideTexts: string[]): SlideFacts {
  const slides = slideTexts.map((t, i): SlideFact => {
    const urls = extractUrls(t);
    return {
      number: i + 1,
      wordCount: words(t),
      urls,
      hasSource: urls.length > 0 || SOURCE_LINE_RE.test(t) || citationCount(t) > 0,
    };
  });
  return {
    slideCount: slides.length,
    slides,
    slidesMissingSource: slides.filter((s) => !s.hasSource).map((s) => s.number),
  };
}
