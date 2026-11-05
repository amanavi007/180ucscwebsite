import { redirect } from "next/navigation";
import { companiesHref, legacyOutreachRedirect } from "@/lib/outreach/links";

/** Discovery now lives inside Companies (the Found and Skipped chips). Old links and bookmarks still land there. */
export default async function OutreachDiscoveryPage({ searchParams }: { searchParams: Promise<{ outcome?: string; candidate?: string }> }) {
  const { outcome, candidate } = await searchParams;
  redirect(legacyOutreachRedirect({ outcome, candidate }) ?? companiesHref({ stage: "found" }));
}
