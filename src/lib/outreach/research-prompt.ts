export const RESEARCH_CSV_HEADER =
  "Company,Website,What they do,Size,Stage,Niche,Contact name,Contact role,Contact email,Why they'd need consulting,Source URLs";

/** The prompt execs paste into Claude Research. Its CSV header must match what the importer reads. */
export function buildResearchPrompt(args: { niche: string; needs: string; exclude: string }): string {
  const niche = args.niche.trim() || "[describe the kind of company]";
  const needs = args.needs.trim() || "[what they might need]";
  const exclude = args.exclude.trim() || "none";
  return [
    "You are researching possible clients for 180 Degrees Consulting at UCSC, a student-run consulting group at UC Santa Cruz. A dedicated student team works with a client for one academic quarter on a real strategic challenge, free of charge. We are now reaching out to for-profit startups and small companies, not only nonprofits.",
    "",
    "Find 25 companies that fit this description:",
    niche,
    "",
    "What they might need from a consulting team:",
    needs,
    "",
    "Rules:",
    "- Use only publicly available information (the company's own website, press, public profiles). Every fact you report must come from a page you actually opened, and you must give that page's URL.",
    "- Do not guess. If you cannot find something, leave that cell empty. Never invent a person, an email address or a fact.",
    "- For the contact, prefer a named decision maker (founder, CEO, head of operations, head of partnerships) whose business email is published on the company's site or in a reliable public source. A generic address such as info@ or hello@ is acceptable only if no named person's email is public. Never use personal email domains such as gmail.com for a company contact.",
    "- Skip any company where you cannot find a valid published contact email.",
    "- Skip nonprofits, schools, government bodies and companies with more than 200 employees.",
    `- Skip these companies we have already worked with: ${exclude}.`,
    "- \"What they do\" is one plain sentence. \"Why they'd need consulting\" is one plain, specific sentence tied to something real you found (a recent launch, funding round, new market, hiring). No flattery and no generic claims.",
    "",
    "Output ONLY a CSV, with no commentary before or after it, using exactly this header row on the first line:",
    "",
    RESEARCH_CSV_HEADER,
    "",
    "Put double quotes around any cell that contains a comma. In \"Source URLs\", list the pages the facts came from, separated by semicolons. \"Niche\" must be one of: strategy, tech, med-tech, other.",
  ].join("\n");
}

export const COMPANY_LIST_CSV_HEADER = "Company,Website,What they do,Niche,Source URLs";

/**
 * A prompt for Claude Research that asks only for company names and websites. Contact details are left to the portal,
 * which reads each company's own site, so no email address is ever the model's guess.
 */
export function buildCompanyListPrompt(args: { niche: string; region: string; needs: string; exclude: string }): string {
  const niche = args.niche.trim() || "[describe the kind of company]";
  const region = args.region.trim() || "the San Francisco Bay Area";
  const needs = args.needs.trim() || "[what they might need]";
  const exclude = args.exclude.trim() || "none";
  return [
    "You are building a list of possible clients for 180 Degrees Consulting at UCSC, a student-run consulting group at UC Santa Cruz. A dedicated student team works with a client for one academic quarter on a real strategic challenge, free of charge.",
    "",
    "Find 40 companies that fit this description:",
    niche,
    "",
    `Where: ${region}.`,
    "",
    "What they might need from a consulting team:",
    needs,
    "",
    "Rules:",
    "- Use only public sources you actually opened: the company's own website, news, funding announcements, accelerator and incubator portfolio pages, public directories. Give the URL of each page your facts came from.",
    "- Only real, currently operating companies that have their own website. Never invent a company or a website. If you are not sure a company exists, leave it out.",
    "- Never include email addresses, phone numbers or people's names. Contact details are collected separately from each company's own website, so do not look for them and never guess one.",
    "- Prefer small and mid-sized companies (about 5 to 200 people) that are growing, over very early two-person teams and over large corporations.",
    "- Skip nonprofits, schools, government bodies and consultancies.",
    `- Skip these companies we have already worked with or contacted: ${exclude}.`,
    "- \"What they do\" is one plain sentence taken from what you read. No flattery, no hype.",
    "",
    "Output ONLY a CSV, with no commentary before or after it, using exactly this header row on the first line:",
    "",
    COMPANY_LIST_CSV_HEADER,
    "",
    "Put double quotes around any cell that contains a comma. \"Website\" is the company's own homepage. \"Niche\" must be one of: strategy, tech, med-tech, other. In \"Source URLs\", list the pages the facts came from, separated by semicolons.",
  ].join("\n");
}
