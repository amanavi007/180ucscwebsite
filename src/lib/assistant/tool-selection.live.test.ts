/**
 * Live tool-selection eval. Skipped unless LIVE_EVAL=1 (it calls the real model and costs quota).
 * Data is a stub, so no database is touched: this only measures whether the right tool is chosen.
 *   LIVE_EVAL=1 npx vitest run src/lib/assistant/tool-selection.live.test.ts
 */
import { readFileSync } from "node:fs";
import { generateText, isStepCount } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
for (const m of ["calendar", "exec-todos", "projects", "quick-links", "tasks", "team-profiles", "attendance", "wiki", "members", "recruit", "quarters", "clients", "team-builder", "org-settings", "coffee-chat", "interview", "client-meeting", "search"]) {
  vi.doMock(`@/actions/${m}`, () => new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : async () => ({})), has: () => true }));
}

import { buildInstructions } from "./system-prompt";
import { matchShortcut, selectAreas } from "./routing";
import { makeData } from "./eval-fixtures";
import type { ToolDeps } from "./tools/types";

const RUN = process.env.LIVE_EVAL === "1";

type Case = { q: string; role?: "exec" | "consultant"; any: string[] };
/** `any`: the first step must call at least one of these tools. "shortcut" = answered with zero tokens. */
const CASES: Case[] = [
  // reads
  { q: "what todos do I have", any: ["shortcut"] },
  { q: "do I have any overdue tasks?", any: ["my_open_tasks", "tasks"] },
  { q: "what's Priya working on", any: ["tasks", "person_detail"] },
  { q: "show me everything overdue on the Acme project", any: ["tasks", "project_detail"] },
  { q: "how is the Acme project doing", any: ["project_detail"] },
  { q: "who is the PM on Beta Labs", any: ["project_detail", "quarter_projects", "directory"] },
  { q: "which projects are at risk", any: ["quarter_projects"] },
  { q: "what events are coming up in the next 2 weeks", any: ["upcoming_events"] },
  { q: "when is the next meeting day", any: ["meeting_dates", "upcoming_events"] },
  { q: "what's my attendance", any: ["shortcut"] },
  { q: "who has missed the most meetings", role: "exec", any: ["attendance_report", "member_stats"] },
  { q: "which teams haven't logged attendance", role: "exec", any: ["team_attendance_status"] },
  { q: "who are the top applicants", any: ["shortcut"] },
  { q: "how many points does Jo Park have", role: "exec", any: ["applicant_detail", "top_applicants"] },
  { q: "what recruitment point categories do we have", role: "exec", any: ["recruit_setup"] },
  { q: "who has interviews booked this week", role: "exec", any: ["scheduling"] },
  { q: "list our quarters", role: "exec", any: ["quarters"] },
  { q: "what clients have we worked with", role: "exec", any: ["clients"] },
  { q: "where do alumni work now", any: ["alumni"] },
  { q: "anything that needs my attention", role: "exec", any: ["needs_attention", "notifications"] },
  { q: "show my notifications", any: ["notifications"] },
  { q: "what did people change recently", role: "exec", any: ["activity_log"] },
  { q: "who's on the Acme team", any: ["project_detail", "directory"] },
  { q: "find the project deliverable template link", any: ["quick_links", "resources", "search"] },
  { q: "give me the drive folder link", any: ["quick_links"] },
  // guide
  { q: "how do I build an issue tree", role: "consultant", any: ["resources"] },
  { q: "what font should my slides use", role: "consultant", any: ["resources"] },
  { q: "what's the process for client emails", role: "consultant", any: ["resources"] },
  { q: "what should I do next on my project", role: "consultant", any: ["my_next_steps"] },
  { q: "I'm stuck, where do I start", role: "consultant", any: ["my_next_steps", "resources"] },
  { q: "show me the onboarding page", role: "consultant", any: ["resources"] },
  // writes
  { q: "add a task to Acme called draft the memo for Priya due Friday", any: ["propose_task"] },
  { q: "mark the memo task done", any: ["propose_task_update"] },
  { q: "push the market research task to next Wednesday", any: ["propose_task_update"] },
  { q: "reassign the slide deck task to me", any: ["propose_task_update"] },
  { q: "delete the draft memo task", any: ["propose_task_delete"] },
  { q: "move Acme to presentation practice", any: ["propose_project_status"] },
  { q: "add Sam to the Beta Labs team", role: "exec", any: ["propose_project_member"] },
  { q: "set Acme's health to at risk", any: ["propose_project_health"] },
  { q: "log attendance for Acme, Priya was absent", any: ["propose_attendance"] },
  { q: "add a to-do to book the venue for the social", role: "exec", any: ["propose_exec_todo"] },
  { q: "mark the venue to-do as done", role: "exec", any: ["propose_exec_todo_update"] },
  { q: "add a calendar event: end of quarter social on Dec 5 at the beach", role: "exec", any: ["propose_event"] },
  { q: "cancel the social event", role: "exec", any: ["propose_event_update"] },
  { q: "add a quick link to the brand kit https://example.org/brand", role: "exec", any: ["propose_quick_link"] },
  { q: "add a resources page about running client calls", role: "exec", any: ["propose_resource_page"] },
  { q: "add a section to the issue trees page about MECE", role: "exec", any: ["propose_resource_page"] },
  { q: "make Priya a project manager", role: "exec", any: ["propose_member_change"] },
  { q: "archive Sam, he graduated", role: "exec", any: ["propose_member_change"] },
  { q: "give Jo Park 3 points for the coffee chat", role: "exec", any: ["propose_recruitment"] },
  { q: "create a new project for Gamma Corp", role: "exec", any: ["propose_project_create"] },
  { q: "delete the Gamma Corp project", role: "exec", any: ["propose_project_delete"] },
  { q: "cancel Jo Park's interview", role: "exec", any: ["propose_scheduling"] },
  { q: "publish all the interview slots", role: "exec", any: ["propose_scheduling"] },
  { q: "set the attendance threshold to 80%", role: "exec", any: ["propose_admin_setting"] },
  { q: "finalize the Fall draft team plan", role: "exec", any: ["propose_team_plan"] },
];

const data = makeData();

describe.skipIf(!RUN)("tool selection (live model)", () => {
  it("picks sensible first-step tools", async () => {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    const { buildModel } = await import("./provider");
    const { buildTools } = await import("./tools");
    const model = buildModel();
    if (!model) throw new Error("no model configured");
    const failures: string[] = [];
    const rows: string[] = [];
    for (const c of CASES) {
      if (process.env.LIVE_ONLY && !new RegExp(process.env.LIVE_ONLY, "i").test(c.q)) continue;
      const role = c.role === "exec" ? "president" : "consultant";
      const deps: ToolDeps = { profile: { id: "me", name: "Alex Rivera", role }, rowCap: 20, data };
      let got: string[];
      if (matchShortcut(c.q)) got = ["shortcut"];
      else {
        const areas = selectAreas(c.q);
        const tools = buildTools(areas, deps, { threadId: null, store: { insert: async () => ({ id: "p" }) } as never });
        try {
          const r = await generateText({
            model,
            instructions: buildInstructions({ name: deps.profile.name, role }, "Fall 2026", "2026-10-07"),
            prompt: c.q,
            tools,
            stopWhen: isStepCount(1),
            maxOutputTokens: 400,
            maxRetries: 3,
          });
          got = r.toolCalls.map((t) => t.toolName);
          if (got.length === 0) got = [`(no tool) said: ${r.text.replace(/\s+/g, " ").slice(0, 120)}`];
        } catch (e) {
          got = [`ERROR ${(e as Error).message.slice(0, 60)}`];
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      const ok = got.some((g) => c.any.includes(g));
      rows.push(`${ok ? "PASS" : "FAIL"} | ${c.q} | expected ${c.any.join("/")} | got ${got.join(",")}${ok ? "" : ` | areas ${selectAreas(c.q).join(",")}`}`);
      if (!ok) failures.push(rows[rows.length - 1]);
    }
    console.log(rows.filter(Boolean).join("\n"));
    console.log(`\n${rows.length - failures.length}/${rows.length} passed`);
    expect(failures).toEqual([]);
  }, 900_000);
});
