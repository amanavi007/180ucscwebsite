import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { unsubscribeProspect } from "@/lib/data/outreach";
import { verifyUnsubscribeToken } from "@/lib/outreach/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export const dynamic = "force-dynamic";

async function confirmUnsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const prospectId = verifyUnsubscribeToken(token, process.env.OUTREACH_UNSUBSCRIBE_SECRET ?? "");
  if (prospectId) await unsubscribeProspect(prospectId);
  redirect("/unsubscribe?done=1");
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token, done } = await searchParams;
  const valid = !!token && !!verifyUnsubscribeToken(token, process.env.OUTREACH_UNSUBSCRIBE_SECRET ?? "");

  return (
    <div className="mx-auto max-w-xl px-4 pt-36 pb-24 sm:px-6">
      {done ? (
        <>
          <h1 className="font-brand text-3xl font-bold tracking-tight">You&apos;re unsubscribed</h1>
          <p className="mt-4 text-lg text-foreground/70">We won&apos;t email you again. Sorry for the interruption.</p>
        </>
      ) : valid ? (
        <>
          <h1 className="font-brand text-3xl font-bold tracking-tight">Unsubscribe from our emails?</h1>
          <p className="mt-4 text-lg text-foreground/70">
            180 Degrees Consulting at UCSC will stop emailing you. This takes effect right away.
          </p>
          <form action={confirmUnsubscribe} className="mt-8">
            <input type="hidden" name="token" value={token} />
            <Button type="submit" size="lg">
              Unsubscribe
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="font-brand text-3xl font-bold tracking-tight">That link didn&apos;t work</h1>
          <p className="mt-4 text-lg text-foreground/70">
            The unsubscribe link is incomplete or out of date. Reply to the email and ask us to stop, and we will.
          </p>
        </>
      )}
    </div>
  );
}
