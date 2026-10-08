import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getOrgTodayDateString } from "@/lib/date";
import type { Area } from "../routing";
import {
  runAttendanceReport,
  runDirectory,
  runMyAttendance,
  runMyOpenTasks,
  runMyProjects,
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
    ...(areas.includes("actions") ? buildWriteTools(actor, ctx.threadId, ctx.store) : {}),
  };
}
