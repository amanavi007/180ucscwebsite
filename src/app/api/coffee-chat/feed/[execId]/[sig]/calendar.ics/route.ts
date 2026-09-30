import { buildExecFeed, isValidFeedSignature } from "@/lib/calendar-feed";

export async function GET(_request: Request, { params }: { params: Promise<{ execId: string; sig: string }> }) {
  const { execId, sig } = await params;
  if (!isValidFeedSignature(execId, sig)) {
    return new Response("Not found.", { status: 404 });
  }

  return new Response(await buildExecFeed(execId), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
