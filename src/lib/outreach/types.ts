export interface ProspectFact {
  text: string;
  sourceUrl: string;
}

/** One researched prospect, as imported from the research CSV. */
export interface ProspectDraftRow {
  company: string;
  website: string | null;
  niche: string | null;
  sizeStage: string | null;
  summary: string | null;
  whyFit: string | null;
  facts: ProspectFact[];
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string;
}
