import type { Metadata } from "next";
import { ArrowUpRight, ChevronDown, Coffee, FileText, MessageCircle, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionPanel } from "@/components/ui/accordion";
import { PhotoPlaceholder } from "@/components/marketing/photo-placeholder";

export const metadata: Metadata = { title: "Apply Now" };

// TODO: point this at the real recruitment application (Google Form, Airtable,
// etc.) before launch. This is a placeholder.
const APPLY_FORM_URL = "https://forms.gle/9pmXAsHmCFmNXKTE8";

// Tilted photo-print collage in the hero. Photos only, no captions.
const POLAROIDS = [
  { src: "/stock/hero-team.jpg", label: "180DC UCSC team", className: "top-4 left-0 -rotate-6" },
  { src: "/stock/apply-info-session.jpg", label: "180DC UCSC info session", className: "top-0 right-0 rotate-[5deg]" },
  { src: "/stock/team-hero-candid.jpg", label: "180DC UCSC members candid", className: "top-44 left-16 rotate-[3deg] sm:top-48 sm:left-20" },
];

const STEPS = [
  {
    icon: FileText,
    title: "Submit your application",
    body: "A short application covering your background and why you're interested in social-impact consulting. Open to every major, every year.",
  },
  {
    icon: Coffee,
    title: "Grab a coffee chat",
    body: "A casual, in-person conversation with two of our exec members. No prep needed, just show up and chat.",
  },
  {
    icon: MessageCircle,
    title: "Interview with our team",
    body: "By invitation. If we invite you, you'll get an email with a link to book a one-hour, conversational interview with a panel of our execs (sometimes including a short case exercise) at the SnE Library.",
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
    a: "No. We look for curiosity, work ethic, and genuine interest in social impact. We train everyone on the actual consulting skills.",
  },
  {
    q: "Can I apply if I'm not a business or economics major?",
    a: "Yes. Our members come from every discipline on campus, and diverse perspectives make our project teams stronger.",
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
      <section className="w-full overflow-hidden bg-mint pt-32 pb-16 sm:pt-36 sm:pb-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
          <div>
            <p className="text-sm font-bold tracking-wide text-primary uppercase">Apply Now</p>
            <h1 className="font-brand mt-3 max-w-2xl text-5xl leading-[0.98] font-extrabold text-balance sm:text-6xl lg:text-7xl">
              Every major. Every year.{" "}
              <span className="text-warm">Every kind of curious.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-foreground/70 text-pretty">
              No consulting experience needed. We train you, then put you on a
              live client team to build real skills while helping an
              organization that needs it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button nativeButton={false}
                size="lg"
                render={<a href={APPLY_FORM_URL} target="_blank" rel="noopener noreferrer" />}
                className="gap-1.5 rounded-full"
              >
                Start Your Application
                <ArrowUpRight className="size-4" />
              </Button>
              <Button nativeButton={false} size="lg" variant="outline" render={<a href="/apply/coffee-chat" />} className="gap-1.5 rounded-full">
                Book a Coffee Chat
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="relative mx-auto h-[22rem] w-full max-w-md sm:h-[26rem] lg:max-w-none">
            {POLAROIDS.map((p) => (
              <div
                key={p.src}
                className={`absolute w-40 rounded-md bg-white p-2.5 pb-7 shadow-xl shadow-black/15 sm:w-52 ${p.className}`}
              >
                <PhotoPlaceholder label={p.label} src={p.src} className="aspect-square w-full rounded-sm" />
              </div>
            ))}
            <span className="absolute right-0 bottom-2 -rotate-[4deg] rounded-full bg-warm px-4 py-2.5 text-sm font-bold text-warm-foreground shadow-lg">
              Undecided? Perfect.
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <p className="text-sm font-bold tracking-wide text-primary uppercase">Your path in</p>
        <h2 className="font-brand mt-3 text-3xl font-bold tracking-wide uppercase sm:text-4xl">
          How recruitment works
        </h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-foreground/10">
          {STEPS.map((step, i) => (
            <div key={step.title} className="lg:px-6 lg:first:pl-0 lg:last:pr-0">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <step.icon className="size-5" />
                </span>
                <span className="font-brand text-3xl font-extrabold text-primary/35">0{i + 1}</span>
              </div>
              <h3 className="font-brand mt-5 text-xl font-bold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground text-pretty">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="w-full bg-cream py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div>
            <h2 className="font-brand text-3xl font-bold tracking-wide uppercase sm:text-4xl">FAQs</h2>
            <Button nativeButton={false} size="lg" variant="outline" render={<a href="/apply/coffee-chat" />} className="mt-6 rounded-full">
              Book a Coffee Chat
            </Button>
          </div>
          <Accordion className="border-t border-foreground/10">
            {FAQS.map((faq) => (
              <AccordionItem key={faq.q} value={faq.q}>
                <AccordionTrigger>
                  <span className="flex-1 font-semibold">{faq.q}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-panel-open:rotate-180" />
                </AccordionTrigger>
                <AccordionPanel>
                  <p className="text-muted-foreground text-pretty">{faq.a}</p>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="w-full bg-deep py-20 text-center text-white">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="font-brand text-4xl font-bold tracking-wide uppercase sm:text-5xl">Ready to apply?</h2>
          <p className="mt-3 text-white/75">Applications are reviewed on a rolling basis each quarter.</p>
          <Button nativeButton={false}
            size="lg"
            render={<a href={APPLY_FORM_URL} target="_blank" rel="noopener noreferrer" />}
            className="mt-8 gap-1.5 rounded-full bg-[#b9dc8c] text-[#14200c] hover:bg-[#b9dc8c]/90"
          >
            Start Your Application
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
