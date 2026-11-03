# Outreach review and hardening plan (2026-11-03)

Based on a full read of the pipeline (verify, draft, send, follow-up, replies), Discovery, the data layer and the portal screens, plus a read-only look at production data. Mode today: `self_only`, Discovery switch on, 22 prospects (none ever sent to a real company), 1,141 companies ready in the pool.

## What is solid (keep)

Compare-and-set status changes, paced and jittered sending with a 5/10/+2 ramp, bounce/complaint brakes, one-click unsubscribe that survives link scanners, signed webhooks, quoted-text stripping before classifying replies, job heartbeats, webhook self-repair, no invented facts (facts come from the directory and the company's own site), a pool so the daily run never crawls under time pressure.

## Weak points found

Bugs that would hurt once the mode is `live`:

1. **Follow-ups stall at about 50 prospects in flight.** Prepare reads only the 50 oldest waiting prospects, whether or not they are due. Steady state is about 150 waiting, so newer prospects never get follow-ups. Follow-ups are most of the reply volume.
2. **Every follow-up lands a day late.** The due time keeps the clock time of the first send (say 3pm) but the job that drafts runs at 7am, so it sees the prospect due the next morning.
3. **A failed send strands the prospect forever.** The message is marked `failed`, the prospect rolls back, and nothing ever picks it up again (a failed message also blocks re-drafting).
4. **`email.failed` and `email.suppressed` are ignored,** and the webhook is only subscribed to four events. Those emails are recorded as sent and the sequence moves on.
5. **An opt-out only blocks one address.** "Stop emailing us" from a company does not block the company's other inboxes.
6. **"Not right now, try next quarter" is treated as a permanent no.** It auto-unsubscribes a lead that should have gone to a human.
7. **Out-of-office pauses follow-ups for one day only.**
8. **Prepare can time out.** 60 seconds for up to 10 drafts x 3 AI attempts, 25 DNS lookups in a row and follow-ups. It also drafts only 10 a day, which silently caps throughput below the ramp.
9. **Non-business inboxes get through** (`cancel@`, `questions@` are already prospects).
10. **The portal list silently stops at 1,000 prospects / 4,000 messages.**

Gaps against the goals:

11. **Nobody owns a reply.** Forwarded to every exec, so nobody answers, or two do. No "handled" state, no reminder, so a hot lead can sit.
12. **No past-outreach dedupe.** Companies the execs already cold-emailed by hand (Excel) can be emailed again.
13. **Drafts are not checked against the facts.** The check only needs one specific word. A made-up name or number passes.
14. **No visibility without logs** (Hobby plan keeps none). Heartbeats say a job ran, not what it did.
15. **No weekly view of results** (sent, replied, booked, bounced) for the execs.

## Executed in this pass

| # | Change | Fixes |
| --- | --- | --- |
| A | Prepare reads only prospects that are due, ordered by due date | 1 |
| B | Due times snap to the start of the Pacific business day | 2 |
| C | Failed sends go to Needs attention with the reason; failed messages no longer block a redraft | 3 |
| D | Handle `email.failed` / `email.suppressed`; the daily webhook check also repairs the subscribed event list | 4 |
| E | An opt-out, not-interested reply or complaint blocks the whole company domain; new "later" reply class goes to a human; out-of-office pauses 4 days | 5, 6, 7 |
| F | Prepare: 300s limit, time budget, DNS in parallel, draft batch follows the daily limit; each job stores what it did | 8, 14 |
| G | More non-business inbox names; purge the two bad prospects already in prod and re-screen the pool | 9 |
| H | Portal list reads every row | 10 |
| I | Reply ownership: "I've got this" and "Mark handled", Needs-you list drops handled replies, daily nudge for replies unhandled after a day | 11 |
| J | Weekly digest email on Mondays | 15 |
| K | "Already contacted" list in Discovery: paste companies or emails, they become do-not-contact | 12 |
| L | Draft grounding check: every name or number in an email must appear in the company data, club facts or past clients | 13 |

## Recommended next (not done, with reasons)

- **Threaded follow-ups** (same subject, `In-Reply-To`). Reply rates are better, but it needs a custom Message-ID header on Resend and a deliverability test first. A "Re:" subject on a thread that has no reply would be deceptive, so no shortcuts.
- **Results by niche / team size / ask wording.** Needs sends first; the digest records the raw counts so the data is there.
- **Better sources than YC alone.** UCSC alumni founders, Santa Cruz and Bay Area local businesses, accelerator portfolios through the existing paste-in list. Needs the user's own Claude Research runs, not code.
- **Hold new first emails while replies wait.** Worth adding once ownership data shows how long replies really sit.
- **Gmail Promotions tab.** Reputation on a new domain; only time and real replies fix it. Do not buy a "warm-up" tool.
- **Before `live`:** decide what happens to the 11 Oct-23 prospects (`founders@` inboxes written for a different draft style) and review the first 5 days of drafts by eye.
