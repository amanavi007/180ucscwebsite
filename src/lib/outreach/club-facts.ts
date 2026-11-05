import { CLIENTS } from "@/lib/clients";

/**
 * What drafts may say about the club. Execs edit this file; the model is told to state nothing
 * about 180 Degrees Consulting beyond it. Keep it honest: the club is student-run.
 */
export const CLUB_FACTS = `
- 180 Degrees Consulting at UCSC is a student-run consulting group at UC Santa Cruz, part of the global 180 Degrees Consulting network.
- A dedicated team of our consultants works with a client for one full academic quarter on a real strategic challenge.
- Projects are free of charge to the client.
- Past work includes growth and market-entry strategy, market and industry research, operational efficiency, branding and marketing, and impact measurement.
- We started with nonprofits and social enterprises and are now expanding into for-profit startups and small Bay Area companies, with new focus areas in tech consulting and med-tech consulting.
- We are an international, university-based consultancy: 180 Degrees Consulting is a global network, and the UCSC branch is run by its own members.
- Past work includes marketing strategy, community engagement initiatives and new program design, for local and Bay Area organizations (see the past clients list below).
- An engagement is a ten-week project on one specific challenge or opportunity. The scope is agreed together with the client first. The team researches the problem and delivers data-informed recommendations.
- Clients can choose between two ways of working. One is research and recommendations. The other adds implementation, where our consultants also help build and roll out the top recommendation, so the client ends the quarter with something working. Both are simply how we work, never described as new.
- The team can help with many kinds of challenges beyond any single example, and the scope is shaped around what the client needs most.
- Examples of what the team can build: a funding or donor tracking system, internal workflow tools, a data dashboard, and social media content that we create and post for the client.
- Services cost the client nothing.
- A prospect can book a 30-minute intro call with our exec team through the booking link that is added to every email.

- Past clients, from our website: ${CLIENTS.map((c) => c.name).join("; ")}.
`.trim();
