/**
 * Live tool-selection eval. Skipped unless LIVE_EVAL=1 (it calls the real model and costs quota).
 * Data is a stub, so no database is touched: this only measures whether the right tool is chosen.
 *   LIVE_EVAL=1 npx vitest run src/lib/assistant/tool-selection.live.test.ts
 */
import { appendFileSync, readFileSync } from "node:fs";
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

type Case = {
  q: string;
  role?: "exec" | "consultant";
  any: string[];
  /** Earlier turns, for follow-up questions that only make sense in context. */
  prior?: { role: "user" | "assistant"; content: string }[];
  /** Checks the arguments of the first call to one of `any`. */
  args?: (input: Record<string, unknown>) => boolean;
};
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
  // independence: paraphrases, vague asks, follow-ups, and questions the wiki should answer
  { q: "whens my next coffee chat", role: "exec", any: ["scheduling"], args: (a) => a.limit === 1 && a.mine === true },
  { q: "do I have any coffee chats this afternoon", role: "exec", any: ["scheduling"], args: (a) => a.mine === true },
  { q: "what other things should i pay attention to when formatting my slides", role: "consultant", any: ["resources"] },
  { q: "how do i lead a team as PM", role: "consultant", any: ["resources"] },
  { q: "how do I run a kickoff meeting", role: "consultant", any: ["resources"] },
  { q: "any tips for client calls", role: "consultant", any: ["resources"] },
  { q: "what's the dress code for the final presentation", role: "consultant", any: ["resources"] },
  { q: "how should I structure my deliverable", role: "consultant", any: ["resources"] },
  { q: "what do I need to pay attention to this week", role: "consultant", any: ["my_next_steps", "my_open_tasks", "upcoming_events", "tasks"] },
  { q: "when is my next deadline", role: "consultant", any: ["my_open_tasks", "my_projects", "tasks"] },
  { q: "who is my PM", role: "consultant", any: ["my_projects", "project_detail", "quarter_projects"] },
  { q: "what's going on with Acme", role: "consultant", any: ["project_detail"] },
  { q: "is anyone on Acme behind", role: "exec", any: ["tasks", "project_detail", "attendance_report"] },
  { q: "who is Jo Park", role: "exec", any: ["person_detail", "directory", "search", "applicant_detail"] },
  { q: "where can I find the brand kit", role: "consultant", any: ["quick_links", "search", "resources"] },
  { q: "what's the next info session", role: "consultant", any: ["upcoming_events"] },
  { q: "email for Priya", role: "consultant", any: ["directory", "person_detail", "search"] },
  { q: "how many people applied", role: "exec", any: ["top_applicants", "applicant_detail"] },
  { q: "what is the attendance policy", role: "consultant", any: ["resources"] },
  { q: "what should the issue tree look like", role: "consultant", any: ["resources"] },
  { q: "how do i write an email to a client", role: "consultant", any: ["resources"] },
  // chapter knowledge base
  { q: "what is MECE", role: "consultant", any: ["knowledge", "resources"] },
  { q: "what does a project manager actually do", role: "consultant", any: ["knowledge", "resources"] },
  { q: "how does recruitment work at our chapter", role: "consultant", any: ["knowledge"] },
  { q: "who founded 180 degrees consulting", role: "consultant", any: ["knowledge"] },
  { q: "what's in a typical client contract", role: "consultant", any: ["knowledge"] },
  { q: "how long is a consulting project and what happens each week", role: "consultant", any: ["knowledge", "resources"] },
  { q: "what is the brand color palette", role: "consultant", any: ["knowledge", "quick_links"] },
  { q: "how do I mark a task done in the portal", role: "consultant", any: ["resources", "my_open_tasks"] },
  { q: "what else should I watch out for", role: "consultant", any: ["resources"], prior: [{ role: "user", content: "how do i lead a team as PM" }, { role: "assistant", content: "Pick a democratic leadership style, know your team's stage, and run an All About Me one-pager. See Leading Your Consulting Team." }] },
  { q: "push it to next wednesday", role: "consultant", any: ["propose_task_update"], prior: [{ role: "user", content: "what's my next task" }, { role: "assistant", content: "Your next task is Draft memo on Acme, due Friday." }] },
  { q: "and who's the SC?", role: "consultant", any: ["project_detail", "quarter_projects", "my_projects"], prior: [{ role: "user", content: "who is the PM on Acme" }, { role: "assistant", content: "Pat Kim is the PM on Acme Corp." }] },
  { q: "what about tomorrow", role: "exec", any: ["scheduling"], args: (a) => !!a.date || !!a.limit, prior: [{ role: "user", content: "any coffee chats today" }, { role: "assistant", content: "Yes, 4 coffee chats today starting at 12:20." }] },
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
/** LIVE_SET=core runs a small, high-signal subset so the eval stays inside free-tier limits. */
const CORE = new Set<string>(["whens my next coffee chat", "do I have any coffee chats this afternoon", "what other things should i pay attention to when formatting my slides", "how do i lead a team as PM", "what's the dress code for the final presentation", "any tips for client calls", "what do I need to pay attention to this week", "when is my next deadline", "who is my PM", "what's going on with Acme", "who is Jo Park", "how many people applied", "where can I find the brand kit", "which projects are at risk", "who has missed the most meetings", "anything that needs my attention", "what else should I watch out for", "push it to next wednesday", "what about tomorrow", "and who's the SC?", "add a task to Acme called draft the memo for Priya due Friday", "mark the memo task done", "add a to-do to book the venue for the social", "give Jo Park 3 points for the coffee chat", "cancel Jo Park's interview", "make Priya a project manager", "email for Priya", "what should I do next on my project"]);

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
      if (process.env.LIVE_SET === "core" && !CORE.has(c.q)) continue;
      if (process.env.LIVE_ONLY && !new RegExp(process.env.LIVE_ONLY, "i").test(c.q)) continue;
      const role = c.role === "exec" ? "president" : "consultant";
      const deps: ToolDeps = { profile: { id: "me", name: "Alex Rivera", role }, rowCap: 20, data };
      let got: string[];
      let calls: { toolName: string; input: unknown }[] = [];
      if (matchShortcut(c.q)) got = ["shortcut"];
      else {
        const areas = selectAreas(c.q);
        const tools = buildTools(areas, deps, { threadId: null, store: { insert: async () => ({ id: "p" }) } as never });
        try {
          const r = await generateText({
            model,
            instructions: buildInstructions({ name: deps.profile.name, role }, "Fall 2026", "2026-10-07"),
            messages: [...(c.prior ?? []), { role: "user" as const, content: c.q }],
            tools,
            stopWhen: isStepCount(1),
            maxOutputTokens: 400,
            maxRetries: 3,
          });
          calls = r.toolCalls as never;
          got = r.toolCalls.map((t) => t.toolName);
          if (got.length === 0) got = [`(no tool) said: ${r.text.replace(/\s+/g, " ").slice(0, 120)}`];
        } catch (e) {
          got = [`ERROR ${(e as Error).message.slice(0, 60)}`];
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      let ok = got.some((g) => c.any.includes(g));
      if (ok && c.args && !got.includes("shortcut")) ok = calls.some((t) => c.any.includes(t.toolName) && c.args!(t.input as Record<string, unknown>));
      rows.push(`${ok ? "PASS" : "FAIL"} | ${c.q} | expected ${c.any.join("/")} | got ${got.join(",")}${ok ? "" : ` | areas ${selectAreas(c.q).join(",")}`}`);
      if (!ok) failures.push(rows[rows.length - 1]);
      if (process.env.LIVE_OUT) appendFileSync(process.env.LIVE_OUT, `${rows[rows.length - 1]}\n`);
    }
    console.log(rows.filter(Boolean).join("\n"));
    console.log(`\n${rows.length - failures.length}/${rows.length} passed`);
    expect(failures).toEqual([]);
  }, 3_600_000);
});
