/**
 * Everything an interviewer needs during a recruiting interview: the walk-through script, the question bank grouped by
 * depth, research prompts, case prompts, and the 40-point rubric. Plain data so it is easy to edit and test.
 * Source: Spring 26 interview notes template, Interview Structure (24/25), Interview Case Criteria, Fall '24 research questions.
 */

export type Depth = "warmup" | "core" | "deep";

export const DEPTHS: { value: Depth; label: string; blurb: string }[] = [
  { value: "warmup", label: "Warm-up", blurb: "Easy to answer. Good for opening and for calming nerves." },
  { value: "core", label: "Core", blurb: "Needs a real example or a clear opinion." },
  { value: "deep", label: "Deep dive", blurb: "Needs a story. Keep asking follow-ups." },
];

export interface BehavioralQuestion {
  key: string;
  /** Number on the Spring 26 notes template, so printed copies still line up. */
  number: number;
  text: string;
  depth: Depth;
  followUps: string[];
}

export const BEHAVIORAL_QUESTIONS: BehavioralQuestion[] = [
  {
    key: "why-180",
    number: 1,
    text: "Why would you like to join 180 Degrees Consulting at UC Santa Cruz?",
    depth: "warmup",
    followUps: ["What did you hear about 180 that stood out?", "What do you hope to get out of it that you can't get elsewhere?"],
  },
  {
    key: "career-fit",
    number: 2,
    text: "How does 180 Degrees fit into your career or future plans?",
    depth: "warmup",
    followUps: ["What would you want to be able to do after a year here?", "Which part of your resume connects to that?"],
  },
  {
    key: "why-consulting",
    number: 8,
    text: "Why are you interested in consulting, and what kind of work do you see yourself doing as a consultant?",
    depth: "warmup",
    followUps: ["What have you done so far to learn about consulting?", "What kind of client or problem would you want to work on?"],
  },
  {
    key: "team-or-solo",
    number: 13,
    text: "Are you better at working with a team or working on your own?",
    depth: "warmup",
    followUps: ["Can you give an example of each?", "What do you do when the other mode is needed?"],
  },
  {
    key: "time",
    number: 14,
    text: "How much time can you dedicate on a weekly basis? How long do you see yourself staying at 180?",
    depth: "warmup",
    followUps: ["What else is on your plate this quarter?", "What happens to 180 when midterms or finals hit?"],
  },
  {
    key: "unique",
    number: 7,
    text: "What skills, talents, or characteristics are unique to you that you can contribute to our branch?",
    depth: "core",
    followUps: ["Tell me about a time you used that.", "How would that help a team of five on a client project?"],
  },
  {
    key: "good-consultant",
    number: 9,
    text: "What makes a good management consultant?",
    depth: "core",
    followUps: ["Which of those qualities are you strongest in? Which are you still building?", "How do you see that showing up on a 180 project?"],
  },
  {
    key: "goal",
    number: 3,
    text: "Describe a goal you set for yourself. How did you go about reaching that goal?",
    depth: "core",
    followUps: ["What got in the way?", "How did you know you were on track?", "What would you do differently?"],
  },
  {
    key: "weakness",
    number: 11,
    text: "What is your greatest weakness?",
    depth: "core",
    followUps: ["What are you doing about it?", "Can you give a recent example where it showed up?"],
  },
  {
    key: "problem-solving",
    number: 12,
    text: "How do you go about solving problems?",
    depth: "core",
    followUps: ["Walk me through a real problem you solved that way.", "What do you do when you get stuck?"],
  },
  {
    key: "different-personality",
    number: 4,
    text: "Tell me about a time you had to work closely with someone whose personality or vision was very different from yours. How did you handle this?",
    depth: "deep",
    followUps: ["What was your role, specifically?", "What did you change about how you worked?", "How did it end up? What did you learn?"],
  },
  {
    key: "pressure",
    number: 5,
    text: "Tell me about a time you were under a lot of pressure. Describe the situation.",
    depth: "deep",
    followUps: ["What did you do first?", "Who did you lean on?", "What was the result, and would you handle it the same way now?"],
  },
  {
    key: "failure",
    number: 6,
    text: "How do you handle failure?",
    depth: "deep",
    followUps: ["Tell me about a specific time.", "What did you change afterward?", "How did it affect the people around you?"],
  },
  {
    key: "dissatisfied",
    number: 10,
    text: "Tell me about a time you were dissatisfied with your work. What could have been done to make it better?",
    depth: "deep",
    followUps: ["How did you notice?", "What did you do about it then, and what would you do now?"],
  },
];

/** Prompts for asking a candidate to say more, for any question. Roughly STAR: situation, task, action, result. */
export const ELABORATE_PROMPTS = [
  "Can you give me a specific example?",
  "What was your part in that, specifically?",
  "What did you do next?",
  "What was the result?",
  "What would you do differently now?",
  "Why did you choose that approach?",
];

export const BEHAVIORAL_PICK_MIN = 5;
export const BEHAVIORAL_PICK_MAX = 6;

/** A suggested spread so one interview doesn't end up all easy or all heavy. */
export const SUGGESTED_MIX: Record<Depth, string> = {
  warmup: "1–2",
  core: "2–3",
  deep: "1–2",
};

export function behavioralMix(keys: string[]): Record<Depth, number> {
  const mix: Record<Depth, number> = { warmup: 0, core: 0, deep: 0 };
  for (const key of keys) {
    const q = BEHAVIORAL_QUESTIONS.find((b) => b.key === key);
    if (q) mix[q.depth] += 1;
  }
  return mix;
}

/** One plain sentence about the picked set, or null when it looks balanced. */
export function behavioralMixAdvice(keys: string[]): string | null {
  const valid = keys.filter((k) => BEHAVIORAL_QUESTIONS.some((q) => q.key === k));
  if (valid.length === 0) return null;
  const mix = behavioralMix(valid);
  if (valid.length < BEHAVIORAL_PICK_MIN) return `Pick ${BEHAVIORAL_PICK_MIN - valid.length} more. Aim for ${BEHAVIORAL_PICK_MIN} to ${BEHAVIORAL_PICK_MAX}.`;
  if (valid.length > BEHAVIORAL_PICK_MAX) return `That's ${valid.length} questions. ${BEHAVIORAL_PICK_MAX} is the most that fits in 12 minutes.`;
  if (mix.deep === 0) return "No deep-dive question yet. Add one so you can see how they handle a real example.";
  if (mix.deep > 2) return "That's a lot of deep dives for 12 minutes. Swap one for a core question.";
  if (mix.warmup === 0) return "No warm-up question. Start with an easy one so they settle in.";
  return null;
}

export interface ResearchPrompt {
  key: string;
  title: string;
  text: string;
}

export const RESEARCH_PROMPTS: ResearchPrompt[] = [
  {
    key: "disney",
    title: "Child Disney stars",
    text: "Provide an analysis of Child Disney Stars and their ability to capitalize on their fame into adulthood. Please include statistics and research with sources. With this knowledge, would you recommend having your kid be a “Disney Child?”",
  },
  {
    key: "pop-culture",
    title: "Pop culture and marketing",
    text: "Please research the effects pop culture has on different societal and economic demographics. Be sure to include statistics and research with sources. Would you recommend utilizing pop culture for marketing to companies?",
  },
  {
    key: "stock",
    title: "A stock as an investment",
    text: "Research a company on the stock market that shows its market trends, competitors, strengths, and weaknesses as an investment. Please include necessary statistics and sources for your research. Would you recommend an investor to buy stocks from this company?",
  },
];

/** Questions to ask during the research portion. */
export const RESEARCH_ASKS = [
  "How many sources did you use?",
  "How did you decide which direction to take the research, based on the topic?",
  "What are the sources?",
  "What did you research first?",
];

export interface CaseInfo {
  key: string;
  title: string;
  /** Where the prompt comes from. */
  source: string;
  prompt: string;
  /** What the interviewer shares only if the candidate asks. */
  ifAsked: { question: string; answer: string }[];
  /** Guidance for the interviewer, not shared. */
  interviewerNotes?: string[];
}

export const CASES: CaseInfo[] = [
  {
    key: "electro-light",
    title: "Electro-Light (sports drink launch)",
    source: "McKinsey sample case",
    prompt:
      "Sports drinks are usually designed to replenish energy, with sugars, and electrolytes, or salts, in the body. However, the product called ‘Electro-Light’ has been formulated to focus more on the replenishment of electrolytes and has a lower sugar content compared to most other sports drinks. SuperSoda’s vice president of marketing has asked you to help analyze key factors surrounding the launch of Electro-Light and its own internal capabilities to support that effort.",
    ifAsked: [
      { question: "What does their current marketing look like?", answer: "They have a deal with Walmart for distribution of the product." },
      {
        question: "What price is it being sold at?",
        answer: "Electro-Light competes with Gatorade and Powerade, so assume it is priced similarly and competitively.",
      },
    ],
  },
  {
    key: "talbot-trucks",
    title: "Talbot Trucks (eTruck investment)",
    source: "McKinsey sample case",
    prompt:
      "Talbot Trucks is a Europe-based private truck Original Equipment Manufacturer (OEM). It produces and sells trucks all over the world. Talbot Trucks is considered a leader in quality manufacturing. Its primary customer base includes large trucking companies that own thousands of trucks and owner-operators, which are smaller customers that own fewer trucks. The CEO of Talbot Trucks has approached you to help determine the attractiveness of an investment in eTruck manufacturing for its European market.",
    ifAsked: [
      { question: "Which geographies in Europe are most receptive to eTrucks?", answer: "Germany, Netherlands, Sweden…" },
      {
        question: "How does revenue differ between regular engine trucks and eTrucks?",
        answer: "Revenue would be similar, but the cost of goods sold would be cheaper for eTrucks than for a regular truck.",
      },
    ],
  },
  {
    key: "fashionco",
    title: "FashionCo (declining revenue)",
    source: "Bain sample case",
    prompt:
      "Our client is FashionCo, a player in the women's fashion market. It’s been in the industry for a long time, but has experienced declining revenues each year for the past five years. FashionCo wants to understand what is causing this decline and what the organization can do to drive revenue. FashionCo will have a management meeting at the end of the week, and the CEO wants a recommendation from you on how to proceed. What can they do to drive revenue?",
    ifAsked: [
      { question: "What are the possible drivers of declining revenue?", answer: "FashionCo decreased its marketing expenses to help increase net income." },
      {
        question: "What are customers' key purchase criteria?",
        answer: "Customers are looking for apparel that is trendy and affordable, which FashionCo does not entirely provide.",
      },
    ],
  },
  {
    key: "coffeegrind",
    title: "CoffeeGrind (falling profits)",
    source: "Wharton casebook, case 6",
    prompt:
      "The CEO of a major client has requested a short-term study examining a small part of the client’s product portfolio. The company has a small division that manufactures automatic drip coffeemakers for the US and Canadian market. The division has been steadily producing coffeemakers for 20 years, and has made few changes to the business over its history. The client has always enjoyed healthy margins for the coffeemaker division, and annual volumes have been steady. Recently, however, the coffeemaker division's profits have been declining. The CEO wants to understand what is going on. What broader insights would you want to explore first to answer the CEO’s question?",
    ifAsked: [
      {
        question: "Did fixed or variable costs change?",
        answer:
          "No. The production lines and facilities are mature, the business has been steady, and production is efficient. No major changes to fixed or variable cost inputs have occurred recently.",
      },
    ],
    interviewerNotes: [
      "This looks like a profitability case, but the point is a framework beyond the standard one. The question asks for “broader” insights.",
      "If they go straight to profit = price × volume − costs, push them to think bigger picture.",
      "This case was done at the partner level, so there is more ambiguity than usual.",
    ],
  },
  {
    key: "foodco",
    title: "FoodCo (triple profitability)",
    source: "Wharton casebook, case 7",
    prompt:
      "Our client is a private equity firm that has invested in FoodCo, a family-owned $19M branded frozen ethnic foods manufacturer operating out of the Northeast. They would like our help to determine how FoodCo can triple their profitability over the next 2 years.",
    ifAsked: [
      { question: "What does the $19M figure measure?", answer: "Revenue." },
      { question: "What is profit now, and what is the goal?", answer: "Profit is $3M today, so the goal is $9M." },
    ],
    interviewerNotes: [
      "They may ask a few clarifying questions about the goal, then should build a framework. Expect areas like the market, revenues, and costs.",
    ],
  },
  {
    key: "skedasky",
    title: "Skedasky Farms (grow revenue)",
    source: "Wharton casebook, case 10",
    prompt:
      "Skedasky Farms is involved in the process of making, selling, and distributing white wines. As of late, industry growth has stagnated. The CEO wants to increase revenue, and has enlisted you to help. To start off, come up with ideas to help the CEO with his goal.",
    ifAsked: [
      { question: "Where do the grapes come from?", answer: "Skedasky grows all of its own grapes." },
      { question: "Where are the farms and facilities?", answer: "Farms are in California, with some processing on site and another large facility nearby." },
      { question: "Who do they sell to?", answer: "Wine distributors, and directly to some stores in the state." },
      { question: "What do they sell?", answer: "A range of grades, from cheaper boxed wine to premium bottles." },
      {
        question: "What is the market like?",
        answer: "Very fragmented (they should be able to guess this). Skedasky has a domestic market share comparable to the other major winemakers in its area.",
      },
    ],
    interviewerNotes: [
      "Open-ended. Lots of brainstorming. Keep them on ways to increase revenue; costs are not relevant for now.",
      "Don't let them get stuck on one idea. If they suggest red wines, that's good, but have them move on to others.",
      "Eventually push them toward the next part of the case.",
    ],
  },
];

export const CASE_REMINDERS = [
  "The correct answer matters less than the justification and the mapping of their reasoning. Say this out loud.",
  "Clarifying questions are to get on the same page, not to get the answer.",
  "Only give data if they ask, or if they are lost and need a nudge.",
  "If the case is too hard or you aren't seeing analysis skills, switch to the coffee market sizing case.",
];

export interface TimedStep {
  key: string;
  label: string;
  minutes: number;
  /** For the interviewer. */
  hint: string;
  /** What to say to the candidate about this step. */
  say: string;
}

/** The case is 16 minutes: 1 + 2 + 8 + 2 + 3. */
export const CASE_STEPS: TimedStep[] = [
  {
    key: "intro",
    label: "Read the prompt",
    minutes: 1,
    hint: "Read it slowly so they can take notes. Offer to repeat it once, and never read it more than twice. Clarifying questions are about the prompt only.",
    say: "I'll read the case slowly so you can take notes. When you're ready, tell me and I'll read it once more. Then you can ask clarifying questions about the prompt, not to solve it, just so we're on the same page.",
  },
  {
    key: "plan",
    label: "Plan an approach",
    minutes: 2,
    hint: "You don't need to talk. Give them space, and remind them it's good to think out loud.",
    say: "Now you have two minutes to plan. Form a hypothesis and decide what you'd want to look into. Write things down, and feel free to think out loud so we can follow where you're going.",
  },
  {
    key: "qa",
    label: "Questions and answers",
    minutes: 8,
    hint: "They lead. Only answer from the list below. Anything else, say \"I can't answer that.\" Keep a straight face.",
    say: "For the next eight minutes, ask me whatever you'd like. I only have certain information, so if I can't answer something, I'll tell you.",
  },
  {
    key: "conclude",
    label: "Form a conclusion",
    minutes: 2,
    hint: "Give them time to gather their thoughts and finish any analysis. Remind them to think out loud.",
    say: "Take two minutes to pull your thinking together and form a conclusion. It's fine to think out loud.",
  },
  {
    key: "present",
    label: "Present the conclusion",
    minutes: 3,
    hint: "They answer the original question from the prompt. Whoever isn't running the case writes down their findings and solution.",
    say: "You have three minutes to present your final conclusion and answer the question from the prompt.",
  },
];

export interface ScriptSection {
  key: "before" | "behavioral" | "research" | "case" | "wrapup";
  label: string;
  /** Minutes for the timer. null means no timer. */
  minutes: number | null;
}

export const SCRIPT_SECTIONS: ScriptSection[] = [
  { key: "before", label: "Before", minutes: null },
  { key: "behavioral", label: "Behavioral", minutes: 12 },
  { key: "research", label: "Research", minutes: 8 },
  { key: "case", label: "Case", minutes: 16 },
  { key: "wrapup", label: "Wrap up", minutes: null },
];

export const SCRIPT = {
  before: {
    checklist: [
      "Open their resume in another tab, and have follow-up questions ready from it.",
      "Pick your 5 to 6 behavioral questions, the case, and decide who asks which part.",
      "Agree who is taking notes. Notes are shared, so only one of you needs to type.",
    ],
    welcome: [
      "Hi, I'm [name] and this is [name]. Thanks for coming in. We're on the exec team, and we'll be working with whoever joins our project teams.",
      "Here's how this goes. Twelve minutes of behavioral questions, then five to eight on your research, then sixteen on a case. We'll keep time.",
      "One thing before we start: for the case, the right answer matters much less than how you reason and how you map out your thinking. It really helps us if you think out loud.",
      "Any questions before we start?",
    ],
  },
  behavioral: {
    intro: "About 2 minutes a question. Ask follow-ups and questions from their resume that fit the conversation. Don't just run down the list.",
  },
  research: {
    intro: "They researched one of the three prompts ahead of time and brought sources. Ask which one they chose, then these.",
  },
  case: {
    intro: "Choose one case and know which one you are reading. Explain the structure below, read the prompt, then walk through the five steps with their timers.",
    explain: [
      "For this part we'll do a case. The correct answer matters much less than how you reason through it, so please think out loud. We want to hear how you're thinking.",
      "It's sixteen minutes in five parts. First, one minute: I'll read the case and you can ask clarifying questions about the prompt, to make sure we're on the same page.",
      "Then two minutes to plan your approach: form a hypothesis and decide what you'd want to look into.",
      "Then eight minutes of questions and answers, led by you. I can only share certain information, so if I can't answer something, I'll say so.",
      "Then two minutes to form a conclusion, and a final three minutes to present it. I'll be keeping time, and I'll stop each part when its time is up.",
    ],
  },
  wrapup: {
    lines: [
      "That's everything from us. What questions do you have for us?",
      "Thank you. You'll hear about next steps from us soon.",
    ],
    after: [
      "Right after they leave, score on your own, then pick Yes, Maybe or No for moving them forward.",
      "Fill in the summary of their approach and answer, and highlight the final answer.",
    ],
  },
} as const;

export type Recommendation = "yes" | "maybe" | "no";

export const RECOMMENDATIONS: { value: Recommendation; label: string }[] = [
  { value: "yes", label: "Move forward" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Don't move forward" },
];

export interface RubricCriterion {
  key: string;
  label: string;
  max: number;
  /** Questions to ask yourself while scoring. */
  asks: string[];
}

export interface RubricSection {
  key: "behavioral" | "research" | "case";
  label: string;
  criteria: RubricCriterion[];
}

/** Rubric 2024-2025, 40 points. */
export const RUBRIC: RubricSection[] = [
  {
    key: "behavioral",
    label: "Behavioral",
    criteria: [
      {
        key: "cohesiveness",
        label: "Cohesiveness",
        max: 6,
        asks: ["Do their answers make sense?", "Are they answering the question?", "Are they giving solid answers?"],
      },
      {
        key: "experience",
        label: "Experience",
        max: 3,
        asks: ["Do they have the skills needed for 180?", "Can they build the skills they're missing here?"],
      },
      {
        key: "interest",
        label: "Demonstrated interest",
        max: 3,
        asks: ["Do they want to be in 180 to build skills?", "Are their reasons for joining valid?"],
      },
      { key: "composure", label: "Composure", max: 4, asks: ["Are they confident and composed?"] },
    ],
  },
  {
    key: "research",
    label: "Research",
    criteria: [
      {
        key: "credibility",
        label: "Credibility",
        max: 3,
        asks: ["Is the content from the most credible source (.org, research articles)? More leeway on lighter questions.", "Does it sound like ChatGPT?"],
      },
      { key: "structure", label: "Structure", max: 2, asks: ["Is the evidence structured?", "Does the content have synthesis?"] },
      { key: "content", label: "Content", max: 3, asks: ["Does it answer the research question?"] },
      { key: "presentation", label: "Presentation", max: 2, asks: ["Do they present confidently?", "Do they sound professional?"] },
    ],
  },
  {
    key: "case",
    label: "Case",
    criteria: [
      {
        key: "questions",
        label: "Questions",
        max: 5,
        asks: ["Are the questions relevant to the case?", "Did they ask a lot, with at least some of the right ones?"],
      },
      {
        key: "explanation",
        label: "Explanation",
        max: 6,
        asks: [
          "Is the thought process detailed?",
          "It doesn't have to be accurate, but it should show critical thinking.",
          "1 = bad answer, bad explanation. 4 = bad answer, good explanation. 6 = good answer, good explanation.",
        ],
      },
      {
        key: "answer",
        label: "Answer",
        max: 3,
        asks: [
          "It doesn't have to be the exact correct answer.",
          "Is it structured, clear and concise?",
          "Good if they have several ideas but flesh out one.",
        ],
      },
    ],
  },
];

export const RUBRIC_CRITERIA: (RubricCriterion & { section: RubricSection["key"] })[] = RUBRIC.flatMap((s) =>
  s.criteria.map((c) => ({ ...c, section: s.key })),
);

export const RUBRIC_TOTAL = RUBRIC_CRITERIA.reduce((n, c) => n + c.max, 0);

export type Scores = Record<string, number>;

export function sectionMax(section: RubricSection["key"]): number {
  return RUBRIC_CRITERIA.filter((c) => c.section === section).reduce((n, c) => n + c.max, 0);
}

export function sectionTotal(scores: Scores, section: RubricSection["key"]): number {
  return RUBRIC_CRITERIA.filter((c) => c.section === section).reduce((n, c) => n + (scores[c.key] ?? 0), 0);
}

export function totalScore(scores: Scores): number {
  return RUBRIC_CRITERIA.reduce((n, c) => n + (scores[c.key] ?? 0), 0);
}

export function isScoreComplete(scores: Scores): boolean {
  return RUBRIC_CRITERIA.every((c) => scores[c.key] !== undefined);
}

/** Null when every score is a whole number inside its range, otherwise a sentence saying what is wrong. */
export function validateScores(scores: unknown): string | null {
  if (typeof scores !== "object" || scores === null || Array.isArray(scores)) return "Scores are missing.";
  const known = new Map(RUBRIC_CRITERIA.map((c) => [c.key, c]));
  for (const [key, value] of Object.entries(scores)) {
    const criterion = known.get(key);
    if (!criterion) return "One of those scores doesn't match the rubric. Refresh the page.";
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > criterion.max) {
      return `${criterion.label} has to be a whole number from 0 to ${criterion.max}.`;
    }
  }
  return null;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function findCase(key: string | null | undefined): CaseInfo | null {
  return CASES.find((c) => c.key === key) ?? null;
}
