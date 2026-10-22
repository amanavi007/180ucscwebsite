import { buildWebhookDeps } from "@/lib/data/outreach-webhook";
import { handleResendWebhook } from "@/lib/outreach/webhook-handler";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleResendWebhook(request, buildWebhookDeps());
}
