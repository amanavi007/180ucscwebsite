# Outreach research prompt

Paste the prompt below into Claude Research (or any research tool that can browse the web). Change the two lines in `[brackets]` first. Save the CSV it gives back as a `.csv` file and upload it in the portal under **Outreach > Import prospects**.

Run it once per niche, about 25 companies at a time. Small batches are more accurate than big ones, and the portal sends slowly anyway.

## The prompt

```text
You are researching possible clients for 180 Degrees Consulting at UCSC, a student-run consulting group at UC Santa Cruz. A dedicated student team works with a client for one academic quarter on a real strategic challenge, free of charge. We are now reaching out to for-profit startups and small companies, not only nonprofits.

Find 25 companies that fit this description:
[NICHE: for example "seed to Series A health-tech and med-tech startups in the San Francisco Bay Area with 5 to 50 employees"]
[WHAT THEY MIGHT NEED: for example "a go-to-market plan, market research, pricing, or an operations review"]

Rules:
- Use only publicly available information (the company's own website, press, public profiles). Every fact you report must come from a page you actually opened, and you must give that page's URL.
- Do not guess. If you cannot find something, leave that cell empty. Never invent a person, an email address or a fact.
- For the contact, prefer a named decision maker (founder, CEO, head of operations, head of partnerships) whose business email is published on the company's site or in a reliable public source. A generic address such as info@ or hello@ is acceptable only if no named person's email is public. Never use personal email domains such as gmail.com for a company contact.
- Skip any company where you cannot find a valid published contact email.
- Skip nonprofits, schools, government bodies and companies with more than 200 employees.
- Skip these companies we have already worked with: [PASTE ANY PAST CLIENTS TO EXCLUDE, or write "none"].
- "What they do" is one plain sentence. "Why they'd need consulting" is one plain, specific sentence tied to something real you found (a recent launch, funding round, new market, hiring). No flattery and no generic claims.

Output ONLY a CSV, with no commentary before or after it, using exactly this header row on the first line:

Company,Website,What they do,Size,Stage,Niche,Contact name,Contact role,Contact email,Why they'd need consulting,Source URLs

Put double quotes around any cell that contains a comma. In "Source URLs", list the pages the facts came from, separated by semicolons. "Niche" must be one of: strategy, tech, med-tech, other.
```

## Before you upload

- Open the CSV and skim it. Delete any row that looks wrong.
- The portal skips past clients, duplicates and anyone who opted out, and checks that each email domain can receive mail.
- Nothing is sent when you import. Drafts are written at 7am Pacific (or press **Generate drafts**), and you can read every one first in test mode.
