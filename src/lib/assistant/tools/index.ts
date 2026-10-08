import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getOrgTodayDateString } from "@/lib/date";
import type { Area } from "../routing";
import {
  runActivityLog,
  runAttendanceReport,
  runDirectory,
  runMyAttendance,
  runMyOpenTasks,
  runMyProjects,
  runMemberStats,
  runNeedsAttention,
  runNotifications,
  runProjectDetail,
  runQuickLinks,
  runSearch,
  runTasks,
  runWiki,
  runQuarterProjects,
  runTopApplicants,
  runUpcomingEvents,
} from "./read-tools";
import type { Actor, ProposalStore } from "../proposals";
import { buildWriteTools } from "./write-tools";
import { compactForModel } from "./compact";
import type { ToolDeps } from "./types";

/** Cards get the full result; the model gets the compact text form. */
const toModelOutput = ({ output }: { output: unknown }) => ({
  type: "text" as const,
  value: compactForModel(output),
});

export function buildReadTools(areas: Area[], deps: ToolDeps): ToolSet {
  const tools: ToolSet = {};
  const empty = z.object({});
  if (areas.includes("projects")) {
    tools.my_projects = tool({
      description: "List the user's projects this quarter (client, status, health, deadline).",
      inputSchema: empty,
      toModelOutput,
      execute: () => runMyProjects(deps),
    });
  }
  if (areas.includes("projects")) {
    tools.quarter_projects = tool({
      description: "All projects this quarter that the user can see: client, status, health, deadline, PM, SC.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runQuarterProjects(deps),
    });
  }
  if (areas.includes("attendance")) {
    tools.my_attendance = tool({
      description: "The user's own attendance rate and counts this quarter.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runMyAttendance(deps),
    });
    tools.attendance_report = tool({
      description: "Exec only: every member's attendance rate this quarter, lowest first. Use for 'who has the worst attendance'.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runAttendanceReport(deps),
    });
  }
  if (areas.includes("people")) {
    tools.directory = tool({
      description: "Look up people by name, role or team (names, roles, teams only). Omit the query to list everyone.",
      inputSchema: z.object({ query: z.string().optional().describe("Name, role or team to search for") }),
      toModelOutput,
      execute: ({ query }) => runDirectory(deps, query),
    });
  }
  if (areas.includes("tasks")) {
    tools.my_open_tasks = tool({
      description: "List the user's open tasks (task, project, due date, status, priority). For execs this also includes their items on the exec to-do list, so use it for any 'tasks' or 'todos' question.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runMyOpenTasks(deps),
    });
  }
  if (areas.includes("events")) {
    tools.upcoming_events = tool({
      description: "List upcoming meetings, deadlines and events visible to the user.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runUpcomingEvents(deps, getOrgTodayDateString()),
    });
  }
  if (areas.includes("recruitment")) {
    tools.top_applicants = tool({
      description: "Exec only: ranked recruitment applicants by total points.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runTopApplicants(deps),
    });
  }
  if (areas.includes("projects")) {
    tools.project_detail = tool({
      description: "Everything about ONE project by client name: status, health, deadline, PM/SC, team, task counts, overdue and next tasks.",
      inputSchema: z.object({ project: z.string().describe("Client/project name") }),
      toModelOutput,
      execute: ({ project }) => runProjectDetail(deps, project, getOrgTodayDateString()),
    });
  }
  if (areas.includes("tasks")) {
    tools.tasks = tool({
      description:
        "Tasks across the team, filterable by project name, assignee name, status or overdue. For the user's OWN tasks use my_open_tasks instead.",
      inputSchema: z.object({
        project: z.string().optional(),
        assignee: z.string().optional().describe("Person's name"),
        status: z.enum(["not_started", "in_progress", "done"]).optional().describe("Omit for all open tasks"),
        overdue_only: z.boolean().optional(),
      }),
      toModelOutput,
      execute: (f) => runTasks(deps, { project: f.project, assignee: f.assignee, status: f.status, overdueOnly: f.overdue_only }, getOrgTodayDateString()),
    });
  }
  if (areas.includes("wiki")) {
    tools.resources = tool({
      description:
        "Search the Resources wiki (guides, templates, policies). Set read=true to get the text of the best-matching page.",
      inputSchema: z.object({ query: z.string(), read: z.boolean().optional() }),
      toModelOutput,
      execute: ({ query, read }) => runWiki(deps, query, !!read),
    });
  }
  if (areas.includes("links")) {
    tools.quick_links = tool({
      description: "The portal's quick links (title, url, category). Optional text filter.",
      inputSchema: z.object({ query: z.string().optional() }),
      toModelOutput,
      execute: ({ query }) => runQuickLinks(deps, query),
    });
  }
  if (areas.includes("notifications")) {
    tools.notifications = tool({
      description: "The user's recent notifications.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runNotifications(deps),
    });
  }
  if (areas.includes("search")) {
    tools.search = tool({
      description: "Search projects, tasks, resources pages and people by name when no other tool fits.",
      inputSchema: z.object({ query: z.string().min(2) }),
      toModelOutput,
      execute: ({ query }) => runSearch(deps, query),
    });
  }
  if (areas.includes("admin")) {
    tools.member_stats = tool({
      description: "Exec only: per-member attendance and task completion/overdue counts for the quarter.",
      inputSchema: z.object({ sort_by: z.enum(["overdue", "attendance", "completion"]).optional() }),
      toModelOutput,
      execute: ({ sort_by }) => runMemberStats(deps, sort_by ?? "overdue"),
    });
    tools.activity_log = tool({
      description: "Exec only: recent activity/audit log (who did what).",
      inputSchema: empty,
      toModelOutput,
      execute: () => runActivityLog(deps),
    });
    tools.needs_attention = tool({
      description: "Exec only: items needing attention (low attendance, unfinalized team plan, pending team-page submissions).",
      inputSchema: empty,
      toModelOutput,
      execute: () => runNeedsAttention(deps),
    });
  }
  return tools;
}

export function buildTools(
  areas: Area[],
  deps: ToolDeps,
  ctx: { threadId: string | null; store: ProposalStore },
): ToolSet {
  const actor: Actor = { id: deps.profile.id, role: deps.profile.role };
  return {
    ...buildReadTools(areas, deps),
    ...(areas.includes("actions") ? buildWriteTools(actor, ctx.threadId, ctx.store, deps) : {}),
  };
}
