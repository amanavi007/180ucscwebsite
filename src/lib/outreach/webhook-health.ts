export interface WebhookInfo {
  id: string;
  endpoint: string;
  status: string;
}

export interface WebhookHealthDeps {
  /** Where the portal receives Resend events, e.g. https://www.ucsc180dc.org/api/webhooks/resend. */
  expectedEndpoint: string;
  list(): Promise<WebhookInfo[]>;
  update(id: string, patch: { endpoint?: string; status: "enabled" }): Promise<void>;
  /** Emails the execs once per reason per day. */
  notify(reason: "webhook_disabled" | "webhook_missing"): Promise<void>;
}

export type WebhookHealth = "ok" | "re_enabled" | "missing" | "unreachable";

const path = (endpoint: string) => {
  try {
    return new URL(endpoint).pathname;
  } catch {
    return "";
  }
};

/**
 * Resend turns a webhook off after repeated failures, and nobody notices until replies stop arriving.
 * Checked daily: a disabled or wrongly addressed webhook is repaired and the execs are told; a missing one is reported.
 */
export async function checkWebhookHealth(deps: WebhookHealthDeps): Promise<WebhookHealth> {
  let hooks: WebhookInfo[];
  try {
    hooks = await deps.list();
  } catch {
    // Not knowing is not the same as a problem, and the next daily run will look again.
    return "unreachable";
  }
  const expectedPath = path(deps.expectedEndpoint);
  const ours = hooks.find((h) => h.endpoint === deps.expectedEndpoint) ?? hooks.find((h) => path(h.endpoint) === expectedPath);
  if (!ours) {
    await deps.notify("webhook_missing");
    return "missing";
  }
  const rightAddress = ours.endpoint === deps.expectedEndpoint;
  if (rightAddress && ours.status === "enabled") return "ok";
  await deps.update(ours.id, rightAddress ? { status: "enabled" } : { endpoint: deps.expectedEndpoint, status: "enabled" });
  if (ours.status !== "enabled") await deps.notify("webhook_disabled");
  return "re_enabled";
}
