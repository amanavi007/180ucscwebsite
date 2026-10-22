import { unsubscribeProspect } from "@/lib/data/outreach";
import { handleUnsubscribeRequest } from "@/lib/outreach/unsubscribe-handler";

export const dynamic = "force-dynamic";

function handle(request: Request) {
  return handleUnsubscribeRequest(request, {
    secret: process.env.OUTREACH_UNSUBSCRIBE_SECRET ?? "",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin,
    unsubscribe: (id) => unsubscribeProspect(id),
  });
}

export const GET = handle;
export const POST = handle;
