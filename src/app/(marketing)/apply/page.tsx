import type { Metadata } from "next";
import { ArrowUpRight, FileText, MessageCircle, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Apply Now" };

// TODO: point this at the real recruitment application (Google Form, Airtable,
// etc.) before launch -- this is a placeholder.
const APPLY_FORM_URL = "https://forms.gle/replace-with-real-application-link";

const STEPS = [
  {
    icon: FileText,
    title: "Submit your application",
    body: "A short application covering your background and why you're interested in social-impact consulting. Open to every major, every year.",
  },
  {
    icon: MessageCircle,
    title: "Interview with our team",
    body: "A conversational interview (sometimes including a short case exercise) to get to know you and how you think through problems.",
  },
  {
    icon: PartyPopper,
    title: "Join the chapter",
    body: "New members go through onboarding and training before being placed on a client project team for the quarter.",
  },
];

const FAQS = [
  {
    q: "Do I need prior consulting experience?",
    a: "No. We look for curiosity, work ethic, and genuine interest in social impact -- we train everyone on the actual consulting skills.",
  },
  {
    q: "Can I apply if I'm not a business or economics major?",
    a: "Yes -- our members come from every discipline on campus. Diverse perspectives make our project teams stronger.",
  },
  {
    q: "What's the weekly time commitment?",
    a: "Expect a few hours a week for general meetings and training, plus additional time with your project team once you're placed on an engagement.",
  },
  {
    q: "When does recruitment happen?",
    a: "We run recruitment at the start of each academic quarter. Check back here or follow our socials for exact dates.",
  },
];

export default function ApplyPage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28">
        <p className="text-sm font-medium tracking-wide text-primary uppercase">Apply Now</p>
        <h1 className="font-brand mt-3 max-w-2xl text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl">
          Join a team doing consulting that matters.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-pretty">
          No two members come from the same background, but everyone
          who joins is here for the same reason: to build real skills while
          helping an organization that needs it.
        </p>
        <div className="mt-8">
          <Button nativeButton={false}
            size="lg"
            render={<a href={APPLY_FORM_URL} target="_blank" rel="noopener noreferrer" />}
            className="gap-1.5"
          >
            Start Your Application
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
          How recruitment works
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="glass-panel rounded-2xl p-6">
              <span className="font-brand text-sm font-bold text-primary">0{i + 1}</span>
              <step.icon className="mt-3 size-6 text-primary" />
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 pb-24">
        <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">FAQs</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {FAQS.map((faq) => (
            <div key={faq.q} className="rounded-2xl border border-foreground/10 p-6">
              <h3 className="font-semibold">{faq.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{faq.a}</p>
            </div>
          ))}
        </div>

        <div className="glass-panel mt-12 flex flex-col items-start justify-between gap-6 rounded-3xl p-10 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-brand text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to apply?
            </h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              Applications are reviewed on a rolling basis each quarter.
            </p>
          </div>
          <Button nativeButton={false}
            size="lg"
            render={<a href={APPLY_FORM_URL} target="_blank" rel="noopener noreferrer" />}
            className="shrink-0 gap-1.5"
          >
            Start Your Application
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
