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
  runNextSteps,
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
import {
  runAlumni,
  runApplicantDetail,
  runClients,
  runMeetingDates,
  runPersonDetail,
  runProjectAttendance,
  runQuarters,
  runRecruitSetup,
  runScheduling,
  runTeamAttendanceStatus,
  runTeamPlans,
} from "./read-tools-more";
import type { Actor, ProposalStore } from "../proposals";
import { buildWriteTools } from "./write-tools";
import { runKnowledge } from "./knowledge-tool";
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
      description: "List the user's own projects this quarter (client, status, health, deadline). Start here for 'my project/team/PM/deadline'.",
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
      description: "List upcoming meetings, deadlines and events visible to the user. Optional: only the next N days, or a text filter.",
      inputSchema: z.object({ days: z.number().int().min(1).max(365).optional(), query: z.string().optional() }),
      toModelOutput,
      execute: ({ days, query }) => runUpcomingEvents(deps, getOrgTodayDateString(), { days, query }),
    });
    tools.meeting_dates = tool({
      description: "The remaining weekly meeting days this quarter.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runMeetingDates(deps, getOrgTodayDateString()),
    });
  }
  if (areas.includes("recruitment")) {
    tools.top_applicants = tool({
      description: "Exec only: ranked recruitment applicants by total points. The result total is the applicant count: use it for 'how many applied/applicants'.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runTopApplicants(deps),
    });
  }
  if (areas.includes("projects")) {
    tools.project_detail = tool({
      description: "Everything about ONE project by client name: status, health, deadline, PM/SC, team, task counts, overdue and next tasks. For 'my PM/SC/team', call my_projects first to get the project name, then this.",
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
  if (areas.includes("wiki") || areas.includes("guide")) {
    tools.resources = tool({
      description:
        "The consultant guide: search the Resources wiki (how-tos, templates, policies, process). Returns the best passages with page links; set read=true ONLY when the user asks for the full page. Use it for ANY 'how do I / what is the process' question.",
      inputSchema: z.object({ query: z.string(), read: z.boolean().optional() }),
      toModelOutput,
      execute: ({ query, read }) => runWiki(deps, query, !!read),
    });
  }
  if (areas.includes("knowledge")) {
    tools.knowledge = tool({
      description:
        "Chapter knowledge base: what 180DC and UCSC are, org structure and roles, recruitment and onboarding, how a client project runs, consulting methods (issue trees, MECE…), deliverable standards, PM resources, past projects, FAQ. Use for chapter/org/method questions; use `resources` for portal how-tos and templates. Returns the best 2 passages.",
      inputSchema: z.object({ query: z.string() }),
      toModelOutput,
      execute: ({ query }) => runKnowledge(deps, query),
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
      description: "Exec only: items needing attention (low attendance, unfinalized team plan, pending team-page submissions). Use for 'anything I should look at / what needs attention / what is pending'.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runNeedsAttention(deps),
    });
  }
  if (areas.includes("recruitment")) {
    tools.applicant_detail = tool({
      description: "Exec only: one applicant by name with their total and point breakdown.",
      inputSchema: z.object({ name: z.string() }),
      toModelOutput,
      execute: ({ name }) => runApplicantDetail(deps, name),
    });
    tools.recruit_setup = tool({
      description: "Exec only: recruitment point categories and this quarter's recruitment events.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runRecruitSetup(deps),
    });
  }
  if (areas.includes("people")) {
    tools.person_detail = tool({
      description: "One person by name (or 'me'): role, team, task load, and attendance (exec or self only). Use for 'who is X'. Not for someone's PM or project; use project_detail.",
      inputSchema: z.object({ name: z.string() }),
      toModelOutput,
      execute: ({ name }) => runPersonDetail(deps, name, getOrgTodayDateString()),
    });
    tools.alumni = tool({
      description: "Graduated alumni: where they work now and which projects they did. Optional text filter.",
      inputSchema: z.object({ query: z.string().optional() }),
      toModelOutput,
      execute: ({ query }) => runAlumni(deps, query),
    });
  }
  if (areas.includes("attendance")) {
    tools.project_attendance = tool({
      description: "A team's logged attendance sessions (date, who logged, excused/unexcused/tardy counts).",
      inputSchema: z.object({ project: z.string() }),
      toModelOutput,
      execute: ({ project }) => runProjectAttendance(deps, project),
    });
    tools.team_attendance_status = tool({
      description: "Exec only: which teams have not logged attendance for meeting days so far.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runTeamAttendanceStatus(deps, getOrgTodayDateString()),
    });
  }
  if (areas.includes("scheduling")) {
    tools.scheduling = tool({
      description:
        "Exec only: upcoming coffee chat, interview and client-meeting bookings. ALWAYS narrow to what was asked: mine=true for 'my'/'I have'; limit=1 for 'next'/'when is'; kind for coffee chat/interview/client meeting; person for a named applicant or exec; date for a day. Never fetch the full list to answer a single-item question.",
      inputSchema: z.object({
        kind: z.enum(["coffee_chat", "interview", "client_meeting"]).optional(),
        mine: z.boolean().optional().describe("Only bookings the user is hosting/on the panel for"),
        person: z.string().optional().describe("Applicant, contact or exec name"),
        date: z.string().optional().describe("YYYY-MM-DD"),
        limit: z.number().int().positive().max(50).optional().describe("Soonest N only; 1 for 'next'"),
        after: z.string().optional().describe("HH:MM, start time at or after (afternoon = 12:00)"),
        before: z.string().optional().describe("HH:MM, start time before (afternoon ends 17:00)"),
      }),
      toModelOutput,
      execute: (a) => runScheduling(deps, getOrgTodayDateString(), a),
    });
  }
  if (areas.includes("admin")) {
    tools.quarters = tool({
      description: "Exec only: all quarters with dates and which is active.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runQuarters(deps),
    });
    tools.clients = tool({
      description: "Exec only: client records (contact, project count, last quarter). Optional name filter.",
      inputSchema: z.object({ query: z.string().optional() }),
      toModelOutput,
      execute: ({ query }) => runClients(deps, query),
    });
    tools.team_plans = tool({
      description: "Exec only: Team Builder drafts for this quarter and whether each is finalized.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runTeamPlans(deps),
    });
  }
  if (areas.includes("guide")) {
    tools.my_next_steps = tool({
      description:
        "For 'what should I do now / next steps / where do I start': the user's projects with stage, nearest tasks and the Resources guide passage for that stage.",
      inputSchema: empty,
      toModelOutput,
      execute: () => runNextSteps(deps, getOrgTodayDateString()),
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
