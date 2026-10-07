import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getOrgTodayDateString } from "@/lib/date";
import type { Area } from "../routing";
import { runMyOpenTasks, runMyProjects, runTopApplicants, runUpcomingEvents } from "./read-tools";
import type { Actor, ProposalStore } from "../proposals";
import { buildWriteTools } from "./write-tools";
import type { ToolDeps } from "./types";

export function buildReadTools(areas: Area[], deps: ToolDeps): ToolSet {
  const tools: ToolSet = {};
  const empty = z.object({});
  if (areas.includes("projects")) {
    tools.my_projects = tool({
      description: "List the user's projects this quarter (client, status, health, deadline).",
      inputSchema: empty,
      execute: () => runMyProjects(deps),
    });
  }
  if (areas.includes("tasks")) {
    tools.my_open_tasks = tool({
      description: "List the user's open tasks (task, project, due date, status, priority).",
      inputSchema: empty,
      execute: () => runMyOpenTasks(deps),
    });
  }
  if (areas.includes("events")) {
    tools.upcoming_events = tool({
      description: "List upcoming meetings, deadlines and events visible to the user.",
      inputSchema: empty,
      execute: () => runUpcomingEvents(deps, getOrgTodayDateString()),
    });
  }
  if (areas.includes("recruitment")) {
    tools.top_applicants = tool({
      description: "Exec only: ranked recruitment applicants by total points.",
      inputSchema: empty,
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
