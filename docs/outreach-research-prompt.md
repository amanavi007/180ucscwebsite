# Outreach research prompt

The prompt now lives in the portal. Open **Admin > Outreach > Import prospects**, fill in the niche and what those companies might need, press **Copy prompt**, and paste it into Claude Research.

Its text is in `src/lib/outreach/research-prompt.ts`, which is also where the CSV columns it asks for are defined (a test checks they match what the importer reads). Edit it there if you want to change the wording.

Tips:
- Run it once per niche, about 25 companies at a time. Small batches are more accurate than big ones, and the portal sends slowly anyway.
- Open the CSV and skim it before uploading. Delete any row that looks wrong.
- The portal skips past clients, duplicates and anyone who opted out, and checks that each email domain can receive mail.
- Nothing is sent when you import. Drafts are written at 7am Pacific (or press **Generate drafts**), and you can read every one first in test mode.
