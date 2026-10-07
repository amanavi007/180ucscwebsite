import { getOrgTodayDateString } from "@/lib/date";
import type { Shortcut } from "../routing";
import {
  runAttendanceReport,
  runMyAttendance,
  runMyOpenTasks,
  runMyProjects,
  runQuarterProjects,
  runTopApplicants,
  runUpcomingEvents,
} from "./read-tools";
import type { ToolDeps } from "./types";

/** The tool behind each zero-token shortcut. Same functions the model's tools call, same permission checks. */
export function runShortcutTool(id: Shortcut, deps: ToolDeps): Promise<unknown> {
  switch (id) {
    case "my_open_tasks":
      return runMyOpenTasks(deps);
    case "upcoming_events":
      return runUpcomingEvents(deps, getOrgTodayDateString());
    case "my_projects":
      return runMyProjects(deps);
    case "quarter_projects":
      return runQuarterProjects(deps);
    case "attendance_report":
      return runAttendanceReport(deps);
    case "my_attendance":
      return runMyAttendance(deps);
    case "top_applicants":
      return runTopApplicants(deps);
  }
}
