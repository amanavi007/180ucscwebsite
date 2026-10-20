import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

const CONTACT_EMAIL = "aavinash@180dc.org";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground mt-3 text-sm">Last updated October 19, 2026</p>

      <div className="mt-10 space-y-8 leading-relaxed">
        <p>
          180 Degrees Consulting at UC Santa Cruz (&ldquo;180DC UCSC&rdquo;, &ldquo;we&rdquo;) is a student-run
          pro bono consulting organization. This page explains what information this website and our member portal
          collect, and how we use it.
        </p>

        <section>
          <h2 className="text-xl font-semibold">Information we collect</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>
              <strong>Applicants:</strong> the name, email address, and application answers you submit, plus the
              interview time you book and notes our interviewers take about your interview.
            </li>
            <li>
              <strong>Members and executives:</strong> your name, email address, role, and the work you do in the
              portal, such as attendance and project assignments.
            </li>
            <li>
              <strong>Executives who connect Google Calendar:</strong> the email address of the Google account you
              connect, and an authorization token that lets the portal create and update interview events on your
              calendar.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">How we use it</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6">
            <li>To run recruitment: scheduling interviews, emailing confirmations and reminders, and evaluating applicants.</li>
            <li>To run the chapter: coordinating projects, attendance, and communication between members.</li>
          </ul>
          <p className="mt-3">We do not sell your information, and we do not use it for advertising.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Google Calendar access</h2>
          <p className="mt-3">
            When an executive connects their Google account, the portal requests permission to create, edit, and
            delete calendar events. We use that permission only to create and update the Google Meet events for
            interviews that the executive is part of, and to invite the applicant and fellow interviewers to them.
            We do not read, copy, or store any of your other calendar events, and we do not use Google user data for
            anything else.
          </p>
          <p className="mt-3">
            The portal&rsquo;s use of information received from Google APIs adheres to the{" "}
            <a
              className="underline underline-offset-4"
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
          <p className="mt-3">
            Authorization tokens are stored encrypted. You can disconnect at any time from the portal, or revoke
            access from your Google Account&rsquo;s third-party access settings. We delete the stored token when you
            disconnect or leave the organization.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Who can see it</h2>
          <p className="mt-3">
            Application and interview information is visible only to the executive team members who run recruitment.
            We use service providers to run the site (hosting, database, and email delivery) and share data with them
            only as needed to operate it. We may disclose information if required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Retention and your choices</h2>
          <p className="mt-3">
            We keep application records for as long as we need them to run recruitment and maintain chapter records.
            You can ask us to see, correct, or delete your information by emailing us at the address below.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="mt-3">
            Questions about this policy:{" "}
            <a className="underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
