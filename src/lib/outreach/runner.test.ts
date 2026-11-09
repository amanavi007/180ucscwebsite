import { pickSender } from "./senders";
import { describe, expect, it, vi } from "vitest";
import { runPrepare, runSend, type MessagePatch, type PrepareDeps, type ProspectPatch, type RunnerProspect, type SendArgs, type SendDeps } from "./runner";
import { DEFAULT_OUTREACH_SETTINGS, type OutreachSettings } from "./settings";
import { OutreachAccountError } from "./errors";
import { verifyUnsubscribeToken } from "./unsubscribe";

interface Msg {
  id: string;
  prospectId: string;
  step: number;
  subject: string;
  bodyText: string;
  status: string;
  scheduledFor: Date | null;
  resendId: string | null;
  sentAt: Date | null;
  error: string | null;
}

const WED_7AM = new Date("2026-10-21T14:00:00Z"); // 7:00 PDT, a Wednesday

const prospect = (n: number, over: Partial<RunnerProspect> = {}): RunnerProspect => ({
  id: `p${n}`,
  company: `Company ${n}`,
  website: `https://company${n}.com`,
  niche: "tech",
  sizeStage: "10, Seed",
  summary: `Builds widget platform number ${n} for logistics`,
  whyFit: "Needs a go-to-market plan",
  facts: [{ text: `Builds widget platform number ${n} for logistics`, sourceUrl: "https://x.com" }],
  contactName: "Jo",
  contactRole: "CEO",
  contactEmail: `jo@company${n}.com`,
  contactDomain: `company${n}.com`,
  status: "drafted",
  step: 0,
  nextActionAt: null,
  firstSentAt: null,
  bookingToken: `tok${n}`,
  ...over,
});

class Store {
  prospects = new Map<string, RunnerProspect>();
  messages = new Map<string, Msg>();
  suppressed = new Set<string>();
  sends: SendArgs[] = [];
  paused = false;
  startedOn: string | null = null;
  brakeNotices: string[] = [];
  addDrafted(n: number, over: Partial<RunnerProspect> = {}) {
    const p = prospect(n, over);
    this.prospects.set(p.id, p);
    this.messages.set(`m${n}`, {
      id: `m${n}`, prospectId: p.id, step: p.step, subject: `Subject ${n}`, bodyText: `Hi Jo, about Company ${n} widget platform.`,
      status: "draft", scheduledFor: null, resendId: null, sentAt: null, error: null,
    });
    return p;
  }
}

const settings = (over: Partial<OutreachSettings> = {}): OutreachSettings => ({
  ...DEFAULT_OUTREACH_SETTINGS,
  mode: "live",
  startedOn: "2026-10-19",
  ...over,
});

function sendDeps(store: Store, over: Partial<SendDeps> = {}, s = settings()): SendDeps {
  return {
    now: WED_7AM,
    settings: s,
    today: "2026-10-21",
    siteUrl: "https://ucsc180dc.org",
    unsubscribeSecret: "secret",
    unsubscribeMailto: "unsubscribe@consulting.ucsc180dc.org",
    fromAddress: "180 Degrees Consulting at UCSC <team@consulting.ucsc180dc.org>",
    replyTo: "replies@consulting.ucsc180dc.org",
    rng: () => 0.5,
    dueDrafts: async (_now, limit) =>
      [...store.messages.values()]
        .filter((m) => m.status === "draft")
        .map((m) => ({
          message: { id: m.id, prospectId: m.prospectId, step: m.step, subject: m.subject, bodyText: m.bodyText, scheduledFor: m.scheduledFor },
          prospect: { ...store.prospects.get(m.prospectId)! },
        }))
        .filter((d) => ["drafted", "sent", "follow_up_1", "follow_up_2"].includes(d.prospect.status))
        .slice(0, limit),
    casProspect: async (id, from, patch: ProspectPatch) => {
      const p = store.prospects.get(id);
      if (!p || !from.includes(p.status)) return false;
      Object.assign(p, { ...patch, status: patch.status ?? p.status });
      return true;
    },
    casMessage: async (id, from, patch: MessagePatch) => {
      const m = store.messages.get(id);
      if (!m || !from.includes(m.status)) return false;
      Object.assign(m, { ...patch, status: patch.status ?? m.status });
      return true;
    },
    isSuppressed: async (email) => store.suppressed.has(email),
    domainBusy: async () => false,
    countScheduledOrSentToday: async () => [...store.messages.values()].filter((m) => m.status === "scheduled").length,
    healthSnapshot: async () => ({ sent: 100, bounced: 0, complained: 0 }),
    bookingOpen: async () => true,
    execEmails: async () => ["exec1@x.com", "exec2@x.com"],
    send: async (args) => {
      store.sends.push(args);
      return { resendId: `re_${store.sends.length}` };
    },
    setPaused: async () => {
      store.paused = true;
    },
    setStartedOn: async (d) => {
      store.startedOn = d;
    },
    notifyBrake: async (reason) => {
      store.brakeNotices.push(reason);
    },
    ...over,
  };
}

describe("runSend", () => {
  it("schedules emails up to the daily cap and marks prospects queued", async () => {
    const store = new Store();
    for (let n = 1; n <= 20; n++) store.addDrafted(n);
    const result = await runSend(sendDeps(store));
    expect(result).toEqual({ scheduled: 5, skipped: null }); // first week of the ramp: cap 5
    expect(store.sends).toHaveLength(5);
    expect([...store.prospects.values()].filter((p) => p.status === "queued")).toHaveLength(5);
    for (const s of store.sends) {
      expect(s.scheduledAt!.getTime()).toBeGreaterThan(WED_7AM.getTime());
      expect(s.to).toHaveLength(1);
      expect(s.replyTo).toBe("replies@consulting.ucsc180dc.org");
      expect(s.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(s.text).toContain("/services/book");
      expect(s.html).toContain("/services/book?lead=tok");
      expect(s.text).toContain("1156 High St, Santa Cruz, CA 95064");
    }
    const token = /unsubscribe\?token=([^>]+)>/.exec(store.sends[0].headers["List-Unsubscribe"])![1];
    expect(verifyUnsubscribeToken(decodeURIComponent(token), "secret")).toMatch(/^p\d$/);
  });

  it("sends each company from its own officer, signed as them, and keeps them on the thread", async () => {
    const store = new Store();
    for (let n = 1; n <= 5; n++) store.addDrafted(n);
    const senders = [
      { id: "a", name: "Aman Avinash", title: "Director of Projects", linkedin: "", enabled: true },
      { id: "d", name: "Devarsh Jayakrishnan", title: "Director of External Affairs", linkedin: "", enabled: true },
    ];
    await runSend(sendDeps(store, {}, settings({ senders })));
    const froms = new Set(store.sends.map((s) => s.from));
    expect(froms).toEqual(new Set(["Aman Avinash <aman@consulting.ucsc180dc.org>", "Devarsh Jayakrishnan <devarsh@consulting.ucsc180dc.org>"]));
    for (const s of store.sends) {
      const who = s.from.startsWith("Aman") ? "Aman Avinash\nDirector of Projects" : "Devarsh Jayakrishnan\nDirector of External Affairs";
      expect(s.text).toContain(who);
    }
    // The officer is written onto the prospect, so a follow-up comes from the same person.
    const queued = [...store.prospects.values()].filter((p) => p.status === "queued");
    expect(queued.every((p) => p.senderId === "a" || p.senderId === "d")).toBe(true);
    const flipped = queued[0].senderId === "a" ? "d" : "a";
    expect(pickSender(senders, queued[0].id, queued[0].senderId ?? null)?.id).not.toBe(flipped);
  });

  it("links the services page in a first email", async () => {
    const store = new Store();
    store.addDrafted(1);
    await runSend(sendDeps(store));
    expect(store.sends[0].text).toContain("https://ucsc180dc.org/services");
    expect(store.sends[0].html).toContain("services page");
  });

  it("uses the single sender in Settings when no officers are set up", async () => {
    const store = new Store();
    store.addDrafted(1);
    await runSend(sendDeps(store));
    expect(store.sends[0].from).toBe("180 Degrees Consulting at UCSC <team@consulting.ucsc180dc.org>");
  });

  it("holds back a draft that fails the current writing rules instead of sending it", async () => {
    const store = new Store();
    store.addDrafted(1);
    store.addDrafted(2);
    const result = await runSend(sendDeps(store, { draftProblems: (m) => (m.prospectId === "p1" ? ["Remove the dashes."] : []) }));
    expect(result.scheduled).toBe(1);
    expect(store.sends).toHaveLength(1);
    expect(store.prospects.get("p1")!.status).toBe("drafted");
  });

  it("does not send more when run again the same day (double-fired cron)", async () => {
    const store = new Store();
    for (let n = 1; n <= 20; n++) store.addDrafted(n);
    await runSend(sendDeps(store));
    const second = await runSend(sendDeps(store));
    expect(second).toEqual({ scheduled: 0, skipped: "cap_reached" });
    expect(store.sends).toHaveLength(5);
  });

  it("skips a prospect that replied between planning and scheduling", async () => {
    const store = new Store();
    store.addDrafted(1);
    store.addDrafted(2);
    const deps = sendDeps(store);
    const original = deps.dueDrafts;
    deps.dueDrafts = async (now, limit) => {
      const snapshot = await original(now, limit);
      store.prospects.get("p1")!.status = "replied"; // a reply lands after the snapshot
      return snapshot;
    };
    await runSend(deps);
    expect(store.sends.map((s) => s.to[0])).toEqual(["jo@company2.com"]);
    expect(store.messages.get("m1")!.status).toBe("draft");
  });

  it("skips suppressed addresses and only sends one email per company domain", async () => {
    const store = new Store();
    store.addDrafted(1);
    store.addDrafted(2, { contactEmail: "other@company1.com", contactDomain: "company1.com" });
    store.addDrafted(3);
    store.suppressed.add("jo@company3.com");
    await runSend(sendDeps(store));
    expect(store.sends.map((s) => s.to[0])).toEqual(["jo@company1.com"]);
  });

  it("skips a domain that was contacted recently", async () => {
    const store = new Store();
    store.addDrafted(1);
    store.addDrafted(2);
    await runSend(sendDeps(store, { domainBusy: async (d) => d === "company1.com" }));
    expect(store.sends.map((s) => s.to[0])).toEqual(["jo@company2.com"]);
  });

  it("in exec_only mode emails the execs and leaves prospects and messages untouched", async () => {
    const store = new Store();
    for (let n = 1; n <= 7; n++) store.addDrafted(n);
    const result = await runSend(sendDeps(store, {}, settings({ mode: "exec_only" })));
    expect(result.scheduled).toBe(5);
    expect(store.sends[0].to).toEqual(["exec1@x.com", "exec2@x.com"]);
    expect(store.sends[0].subject).toMatch(/^\[TEST for Company 1/);
    expect(store.sends[0].scheduledAt).toBeUndefined();
    expect([...store.prospects.values()].every((p) => p.status === "drafted")).toBe(true);
    expect([...store.messages.values()].every((m) => m.status === "draft")).toBe(true);
  });

  it("in self_only mode emails only the test recipient, not the execs", async () => {
    const store = new Store();
    store.addDrafted(1);
    const result = await runSend(sendDeps(store, {}, settings({ mode: "self_only", testRecipient: "aman@x.com" })));
    expect(result.scheduled).toBe(1);
    expect(store.sends[0].to).toEqual(["aman@x.com"]);
    expect([...store.prospects.values()].every((p) => p.status === "drafted")).toBe(true);
  });

  it("in self_only mode with no recipient sends nothing", async () => {
    const store = new Store();
    store.addDrafted(1);
    const result = await runSend(sendDeps(store, {}, settings({ mode: "self_only" })));
    expect(result).toEqual({ scheduled: 0, skipped: "no_test_recipient" });
    expect(store.sends).toHaveLength(0);
  });

  it.each([
    ["off", settings({ mode: "off" }), "mode_off"],
    ["dry_run", settings({ mode: "dry_run" }), "dry_run"],
    ["paused", settings({ paused: true }), "paused"],
  ])("sends nothing when %s", async (_name, s, reason) => {
    const store = new Store();
    store.addDrafted(1);
    const result = await runSend(sendDeps(store, {}, s));
    expect(result).toEqual({ scheduled: 0, skipped: reason });
    expect(store.sends).toHaveLength(0);
  });

  it("holds sends while booking is closed and tells the execs", async () => {
    const store = new Store();
    store.addDrafted(1);
    const result = await runSend(sendDeps(store, { bookingOpen: async () => false }));
    expect(result).toEqual({ scheduled: 0, skipped: "booking_closed" });
    expect(store.sends).toHaveLength(0);
  });

  it("pauses and alerts on a bounce spike", async () => {
    const store = new Store();
    store.addDrafted(1);
    const result = await runSend(sendDeps(store, { healthSnapshot: async () => ({ sent: 50, bounced: 5, complained: 0 }) }));
    expect(result.skipped).toBe("bounce_rate");
    expect(store.paused).toBe(true);
    expect(store.brakeNotices).toEqual(["bounce_rate"]);
    expect(store.sends).toHaveLength(0);
  });

  it("pauses, alerts, stops and rolls the message back on an account-level Resend error", async () => {
    const store = new Store();
    store.addDrafted(1);
    store.addDrafted(2);
    const send = vi.fn().mockRejectedValue(new OutreachAccountError("API key invalid"));
    const result = await runSend(sendDeps(store, { send }));
    expect(result.skipped).toBe("account_error");
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.paused).toBe(true);
    expect(store.brakeNotices).toEqual(["account_error"]);
    expect(store.messages.get("m1")!.status).toBe("draft");
    expect(store.prospects.get("p1")!.status).toBe("drafted");
  });

  it("marks only the one message failed on an ordinary send error and carries on", async () => {
    const store = new Store();
    store.addDrafted(1);
    store.addDrafted(2);
    const send = vi.fn().mockRejectedValueOnce(new Error("bad address")).mockResolvedValue({ resendId: "re_ok" });
    await runSend(sendDeps(store, { send }));
    expect(store.messages.get("m1")!).toMatchObject({ status: "failed", error: "bad address" });
    // Never retried silently: a person sees why and decides, instead of the prospect sitting in limbo forever.
    expect(store.prospects.get("p1")!).toMatchObject({ status: "needs_attention", statusReason: "The email could not be sent: bad address" });
    expect(store.messages.get("m2")!).toMatchObject({ status: "scheduled", resendId: "re_ok" });
  });

  it("sends nothing on a weekend", async () => {
    const store = new Store();
    store.addDrafted(1);
    const saturday = new Date("2026-10-24T16:00:00Z");
    const result = await runSend(sendDeps(store, { now: saturday, today: "2026-10-24" }));
    expect(result).toEqual({ scheduled: 0, skipped: "no_send_times" });
  });

  it("sets the ramp start the first time it runs in a sending mode", async () => {
    const store = new Store();
    store.addDrafted(1);
    const result = await runSend(sendDeps(store, {}, settings({ startedOn: null })));
    expect(store.startedOn).toBe("2026-10-21");
    expect(result.scheduled).toBe(1);
  });
});

function prepareDeps(store: Store, over: Partial<PrepareDeps> = {}, s = settings({ mode: "dry_run" })): PrepareDeps {
  const base = sendDeps(store, {}, s);
  return {
    now: WED_7AM,
    settings: s,
    today: base.today,
    siteUrl: base.siteUrl,
    unsubscribeSecret: base.unsubscribeSecret,
    unsubscribeMailto: base.unsubscribeMailto,
    fromAddress: base.fromAddress,
    replyTo: base.replyTo,
    listProspects: async (statuses, limit, opts) =>
      [...store.prospects.values()]
        .filter((p) => statuses.includes(p.status))
        .filter((p) => !opts?.dueBy || (p.nextActionAt !== null && p.nextActionAt <= opts.dueBy))
        .slice(0, limit),
    casProspect: base.casProspect,
    casMessage: base.casMessage,
    checkMx: async (d) => d !== "nomx.com",
    draft: async ({ row }) => ({ draft: { subject: `About ${row.company}`, body: `Hi, I saw ${row.company} builds widget platforms for logistics.` } }),
    insertDraft: async (prospectId, step, draft) => {
      const id = `m_${prospectId}_${step}`;
      store.messages.set(id, { id, prospectId, step, subject: draft.subject, bodyText: draft.body, status: "draft", scheduledFor: null, resendId: null, sentAt: null, error: null });
    },
    hasMessageForStep: async (pid, step) => [...store.messages.values()].some((m) => m.prospectId === pid && m.step === step),
    previousSubjects: async (pid) => [...store.messages.values()].filter((m) => m.prospectId === pid).map((m) => m.subject),
    recentDraftBodies: async () => [],
    listScheduledDue: async (before) =>
      [...store.messages.values()]
        .filter((m) => m.status === "scheduled" && m.scheduledFor && m.scheduledFor <= before)
        .map((m) => ({ messageId: m.id, step: m.step, scheduledFor: m.scheduledFor!, prospect: { ...store.prospects.get(m.prospectId)! } })),
    ...over,
  };
}

describe("runPrepare", () => {
  it("rewrites old drafts that fail the current rules and reports how many", async () => {
    const store = new Store();
    const result = await runPrepare(prepareDeps(store, { refreshStaleDrafts: async () => 3 }));
    expect(result.staleRewritten).toBe(3);
  });

  it("verifies new prospects and marks undeliverable ones invalid with a reason", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "new" }));
    store.prospects.set("p2", prospect(2, { status: "new", contactDomain: "nomx.com", contactEmail: "a@nomx.com" }));
    store.prospects.set("p3", prospect(3, { status: "new", contactDomain: "mailinator.com", contactEmail: "a@mailinator.com" }));
    await runPrepare(prepareDeps(store));
    expect(store.prospects.get("p2")).toMatchObject({ status: "invalid" });
    expect(store.prospects.get("p3")).toMatchObject({ status: "invalid" });
    // p1 verified, then drafted in the same run
    expect(store.prospects.get("p1")!.status).toBe("drafted");
    expect(store.messages.get("m_p1_0")).toBeTruthy();
  });

  it("marks a verified prospect needs_attention when drafting says so", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "verified" }));
    const draft = vi.fn().mockResolvedValue({ needsAttention: "No researched facts" });
    await runPrepare(prepareDeps(store, { draft }));
    expect(store.prospects.get("p1")).toMatchObject({ status: "needs_attention", statusReason: "No researched facts" });
  });

  it("keeps drafting other companies when one draft call throws, and counts the failure", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "verified" }));
    store.prospects.set("p2", prospect(2, { status: "verified" }));
    const draft = vi.fn().mockImplementation(async ({ row }: { row: { company: string } }) => {
      if (row.company === "Company 1") throw new Error("AI provider unavailable");
      return { draft: { subject: `About ${row.company}`, body: `Hi, I saw ${row.company} builds widget platforms for logistics.` } };
    });
    const result = await runPrepare(prepareDeps(store, { draft }));
    expect(result.draftErrors).toBe(1);
    expect(result.drafted).toBe(1);
    // The failed company is left verified so a later run retries it; the other one drafted fine.
    expect(store.prospects.get("p1")!.status).toBe("verified");
    expect(store.prospects.get("p2")!.status).toBe("drafted");
  });

  it("still verifies and drafts when the stale-draft refresh throws", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "new" }));
    const refreshStaleDrafts = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const result = await runPrepare(prepareDeps(store, { refreshStaleDrafts }));
    expect(result.verified).toBe(1);
    expect(store.prospects.get("p1")!.status).toBe("drafted");
  });

  it("reconciles the other scheduled messages when one of them throws", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "queued" }));
    store.prospects.set("p2", prospect(2, { status: "queued" }));
    const past = new Date("2026-10-19T20:00:00Z");
    store.messages.set("m1", { id: "m1", prospectId: "p1", step: 0, subject: "S", bodyText: "B", status: "scheduled", scheduledFor: past, resendId: "re_1", sentAt: null, error: null });
    store.messages.set("m2", { id: "m2", prospectId: "p2", step: 0, subject: "S", bodyText: "B", status: "scheduled", scheduledFor: past, resendId: "re_2", sentAt: null, error: null });
    const base = prepareDeps(store, {}, settings({ mode: "live" }));
    const casMessage = vi.fn().mockImplementation(async (id: string, from: string[], patch: MessagePatch) => {
      if (id === "m1") throw new Error("database unavailable");
      return base.casMessage(id, from, patch);
    });
    const result = await runPrepare({ ...base, casMessage });
    expect(result.reconciled).toBe(1);
    expect(store.messages.get("m2")).toMatchObject({ status: "sent" });
    expect(store.prospects.get("p2")).toMatchObject({ status: "sent", step: 1 });
  });

  it("regenerates a draft that is a near-duplicate of one already written in the batch", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "verified" }));
    store.prospects.set("p2", prospect(2, { status: "verified" }));
    const bodies = [
      "Hi Jo, I saw your team builds widget platforms for logistics companies across the bay area and wanted to reach out.",
      "Hi Jo, I saw your team builds widget platforms for logistics companies across the bay area and wanted to reach out!",
      "Hello, Company 2's logistics widgets caught our eye, and a short call could be useful.",
    ];
    const draft = vi.fn().mockImplementation(async () => ({ draft: { subject: "S", body: bodies.shift()! } }));
    await runPrepare(prepareDeps(store, { draft }));
    expect(draft).toHaveBeenCalledTimes(3);
    expect(store.messages.get("m_p2_0")!.bodyText).toMatch(/^Hello/);
  });

  it("does not draft when the mode is off", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "verified" }));
    const result = await runPrepare(prepareDeps(store, {}, settings({ mode: "off" })));
    expect(result).toEqual({ verified: 0, drafted: 0, needsAttention: 0, reconciled: 0, followUps: 0 });
    expect(store.messages.size).toBe(0);
  });

  it("turns a scheduled message that is now in the past into a sent one and schedules the follow-up", async () => {
    const store = new Store();
    const p = prospect(1, { status: "queued" });
    store.prospects.set("p1", p);
    const monday = new Date("2026-10-19T20:00:00Z");
    store.messages.set("m1", { id: "m1", prospectId: "p1", step: 0, subject: "S", bodyText: "B", status: "scheduled", scheduledFor: monday, resendId: "re_1", sentAt: null, error: null });
    await runPrepare(prepareDeps(store, {}, settings({ mode: "live" })));
    expect(store.messages.get("m1")).toMatchObject({ status: "sent" });
    expect(store.prospects.get("p1")).toMatchObject({ status: "sent", step: 1 });
    expect(store.prospects.get("p1")!.nextActionAt!.toISOString().slice(0, 10)).toBe("2026-10-23"); // 4 business days later
  });

  it("leaves a prospect who replied alone when their scheduled message is reconciled", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "replied" }));
    store.messages.set("m1", { id: "m1", prospectId: "p1", step: 0, subject: "S", bodyText: "B", status: "scheduled", scheduledFor: new Date("2026-10-19T20:00:00Z"), resendId: "re_1", sentAt: null, error: null });
    await runPrepare(prepareDeps(store, {}, settings({ mode: "live" })));
    expect(store.prospects.get("p1")!.status).toBe("replied");
  });

  it("drafts a due follow-up for a prospect with no reply, once", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "sent", step: 1, nextActionAt: new Date("2026-10-21T00:00:00Z"), firstSentAt: new Date("2026-10-19T20:00:00Z") }));
    store.messages.set("m0", { id: "m0", prospectId: "p1", step: 0, subject: "First", bodyText: "B", status: "sent", scheduledFor: null, resendId: "r", sentAt: new Date(), error: null });
    const deps = prepareDeps(store, {}, settings({ mode: "live" }));
    await runPrepare(deps);
    await runPrepare(deps);
    const followUps = [...store.messages.values()].filter((m) => m.step === 1);
    expect(followUps).toHaveLength(1);
  });

  it("still drafts a due follow-up when far more prospects than the read limit are waiting ahead of it", async () => {
    const store = new Store();
    // 150 prospects whose next step is weeks away, older than the one that is due.
    for (let i = 0; i < 150; i++) store.prospects.set(`w${i}`, prospect(1000 + i, { status: "follow_up_1", step: 2, nextActionAt: new Date("2026-11-30T00:00:00Z") }));
    store.prospects.set("due", prospect(1, { status: "sent", step: 1, nextActionAt: new Date("2026-10-21T00:00:00Z"), firstSentAt: new Date("2026-10-15T20:00:00Z") }));
    const result = await runPrepare(prepareDeps(store, {}, settings({ mode: "live" })));
    expect(result.followUps).toBe(1);
    expect(store.messages.get("m_p1_1")).toBeDefined();
  });

  it("drafts a follow-up again after its first attempt failed to send", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "sent", step: 1, nextActionAt: new Date("2026-10-21T00:00:00Z"), firstSentAt: new Date("2026-10-15T20:00:00Z") }));
    store.messages.set("m1", { id: "m1", prospectId: "p1", step: 1, subject: "S", bodyText: "B", status: "failed", scheduledFor: null, resendId: null, sentAt: null, error: "x" });
    const deps = prepareDeps(store, { hasMessageForStep: async (pid, step) => [...store.messages.values()].some((m) => m.prospectId === pid && m.step === step && !["cancelled", "failed"].includes(m.status)) }, settings({ mode: "live" }));
    expect((await runPrepare(deps)).followUps).toBe(1);
  });

  it("does not draft follow-ups for prospects who have replied, booked or unsubscribed", async () => {
    const store = new Store();
    for (const [i, status] of ["replied", "booked", "unsubscribed", "bounced"].entries()) {
      store.prospects.set(`p${i}`, prospect(i, { status, step: 1, nextActionAt: new Date("2026-10-20T00:00:00Z") }));
    }
    const result = await runPrepare(prepareDeps(store, {}, settings({ mode: "live" })));
    expect(result.followUps).toBe(0);
  });

  it("moves a prospect past its closing note to no_response", async () => {
    const store = new Store();
    store.prospects.set("p1", prospect(1, { status: "closing_note", step: 4, nextActionAt: new Date("2026-10-20T00:00:00Z") }));
    await runPrepare(prepareDeps(store, {}, settings({ mode: "live" })));
    expect(store.prospects.get("p1")!.status).toBe("no_response");
  });
});
