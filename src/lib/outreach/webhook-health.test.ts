import { describe, expect, it, vi } from "vitest";
import { checkWebhookHealth, type WebhookInfo } from "./webhook-health";

const EXPECTED = "https://www.ucsc180dc.org/api/webhooks/resend";

function setup(hooks: WebhookInfo[]) {
  const update = vi.fn().mockResolvedValue(undefined);
  const notify = vi.fn().mockResolvedValue(undefined);
  const run = () => checkWebhookHealth({ expectedEndpoint: EXPECTED, list: async () => hooks, update, notify });
  return { run, update, notify };
}

describe("checkWebhookHealth", () => {
  it("does nothing when the webhook is enabled at the right address", async () => {
    const { run, update, notify } = setup([{ id: "w1", endpoint: EXPECTED, status: "enabled" }]);
    expect(await run()).toBe("ok");
    expect(update).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("turns a disabled webhook back on and tells the execs", async () => {
    const { run, update, notify } = setup([{ id: "w1", endpoint: EXPECTED, status: "disabled" }]);
    expect(await run()).toBe("re_enabled");
    expect(update).toHaveBeenCalledWith("w1", { status: "enabled" });
    expect(notify).toHaveBeenCalledWith("webhook_disabled");
  });

  it("repoints a webhook that has the right path on the wrong address (the apex redirect that got it disabled)", async () => {
    const { run, update, notify } = setup([{ id: "w1", endpoint: "https://ucsc180dc.org/api/webhooks/resend", status: "disabled" }]);
    expect(await run()).toBe("re_enabled");
    expect(update).toHaveBeenCalledWith("w1", { endpoint: EXPECTED, status: "enabled" });
    expect(notify).toHaveBeenCalledWith("webhook_disabled");
  });

  it("repoints an enabled webhook that has the wrong address, since the apex only redirects", async () => {
    const { run, update } = setup([{ id: "w1", endpoint: "https://ucsc180dc.org/api/webhooks/resend", status: "enabled" }]);
    expect(await run()).toBe("re_enabled");
    expect(update).toHaveBeenCalledWith("w1", { endpoint: EXPECTED, status: "enabled" });
  });

  it("tells the execs when there is no webhook for the portal at all", async () => {
    const { run, update, notify } = setup([{ id: "w9", endpoint: "https://other.example.com/hook", status: "enabled" }]);
    expect(await run()).toBe("missing");
    expect(update).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("webhook_missing");
  });

  it("reports unreachable without alarming anyone when Resend cannot be read, since the next daily run looks again", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const result = await checkWebhookHealth({
      expectedEndpoint: EXPECTED,
      list: async () => {
        throw new Error("network");
      },
      update: vi.fn(),
      notify,
    });
    expect(result).toBe("unreachable");
    expect(notify).not.toHaveBeenCalled();
  });
});
