# Outreach setup and rollout

Do these once, in order. Nothing is sent to a real company until the last section, and you control that from **Admin > Outreach > Settings**.

Design: `docs/superpowers/specs/2026-10-22-automated-outreach-design.md`.

## 1. Database

Apply the migration `supabase/migrations/20261022000001_outreach.sql` to the Supabase project (for example `supabase db push`). This changes the live database, so do it deliberately. It was written and type-checked but has not been run against a real database yet; if it errors, send me the message.

Until it is applied, the Outreach page shows "The outreach list didn't load".

## 2. Resend: the outreach subdomain

Outreach sends from `consulting.ucsc180dc.org` on your existing Resend account, so a problem there stays away from `ucsc180dc.org` itself (booking confirmations, recruitment mail).

1. Resend dashboard > **Domains** > **Add Domain** > `consulting.ucsc180dc.org`.
2. Add the DNS records Resend shows at your domain host: SPF, DKIM, and the **MX record for receiving** (so replies reach Resend). Use only the records on the **subdomain**; do not change MX on `ucsc180dc.org` itself.
3. Add a DMARC record for the subdomain: a TXT record named `_dmarc.consulting` with value `v=DMARC1; p=none; rua=mailto:<an exec inbox>`. Start with `p=none`.
4. Wait until Resend shows the domain as **Verified** for sending and receiving. Everything must be verified before the first email: fixing authentication after sending starts resets your reputation.
5. Check your Resend plan allows a second domain and the daily volume you want. Check this on Resend's pricing page; I could not verify the limits.

## 3. Resend: API key and webhook

1. **API Keys** > create a key named `outreach`. Use full access if the webhook later reports it cannot read received email (sending-only keys may not be allowed to read replies; this is unverified). Keep it separate from the key used for booking emails.
2. **Webhooks** > **Add Webhook**:
   - Endpoint: `https://<your site>/api/webhooks/resend`
   - Events: `email.received`, `email.delivered`, `email.bounced`, `email.complained`
   - Copy the **signing secret**.

The webhook receives events for all mail on the account, including booking confirmations. The portal ignores anything that is not outreach.

## 4. Environment variables

Set these locally (`.env.local`) and in Vercel project settings (see `.env.local.example`):

| Variable | Value |
| --- | --- |
| `OUTREACH_RESEND_API_KEY` | the `outreach` key from step 3 |
| `OUTREACH_FROM` | `180 Degrees Consulting at UCSC <team@consulting.ucsc180dc.org>` |
| `OUTREACH_REPLY_TO` | `replies@consulting.ucsc180dc.org` |
| `RESEND_WEBHOOK_SECRET` | the webhook signing secret |
| `OUTREACH_UNSUBSCRIBE_SECRET` | any long random string (`openssl rand -hex 32`) |
| `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` | already set |

AI drafting uses the AI keys the assistant already has (BayLeaf first, then Gemini or Groq).

## 5. What runs on its own

Vercel crons (already in `vercel.json`):

- **7am Pacific, weekdays and weekends:** verify new prospects, write drafts, mark yesterday's scheduled emails as sent, write due follow-ups. Does nothing while the mode is Off.
- **8am Pacific:** plan the day's emails and hand each to Resend, scheduled at a random time between your window start and end (default 9am to 4pm, weekdays only).

Emails stop for good when a prospect replies, books a call, unsubscribes, or bounces. Every reply is forwarded to all execs, with the prospect's address as the Reply-To, so answer from your own inbox.

Sending pauses itself, and execs are emailed, if bounces pass 2% (at least 2), if anyone reports spam, if Resend rejects the account, or while the booking page is closed.

## 6. Rollout: do not skip steps

1. **Test drafts.** Settings > Mode > *Test drafts*. Import a small CSV (see `docs/outreach-research-prompt.md`), press **Generate drafts**, and read every draft with its sources in the side panel. Fix the club wording in `src/lib/outreach/club-facts.ts` if drafts say anything off. Do not move on until you would be happy to sign them.
2. **Send to execs only.** Mode > *Send to execs only*. Up to five test emails arrive in all exec inboxes. Check, in Gmail and in Outlook if possible: it lands in the inbox, the footer shows the postal address, the Unsubscribe link works, the booking link opens `/services/book` (open the booking page's toggle first), and replying to a test email reaches every exec through the webhook.
3. **Pilot.** Mode > *Live* with 10 to 20 prospects. It starts at 5 a day. Watch the health strip on the Outreach page daily: bounce rate and spam complaints should stay at zero or close to it.
4. **Ramp.** After two weeks the limit rises by 2 a day to 40. You can set a lower daily limit in Settings at any time, or pause.

## 7. What counts as success

Cold email typically gets low single-digit reply rates; well-run campaigns reach 8 to 15%. Judge this by **booked intro calls**, not emails sent. Replies, bookings and bounces are all visible per prospect in the side panel.

## 8. Legal basics (US)

Every email carries a working unsubscribe link and header, an honest subject, and the postal address from Settings (`1156 High St, Santa Cruz, CA 95064`). Opt-outs are permanent and take effect immediately. This is general guidance, not legal advice.
