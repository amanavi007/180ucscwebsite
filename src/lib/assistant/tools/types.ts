import type { UserRole } from "@/lib/supabase/database.types";

export interface ProjectRow { id: string; client_name: string; status: string; health: string; deadline: string | null }
export interface TaskRow {
  id: string; task_name: string; due_date: string | null; status: string; priority: string;
  project: { client_name: string } | null;
}
export interface ExecTodoRow { id: string; title: string; due_date: string | null; assigned_to: string[] }
export interface EventRow { date: string; title: string; type: string; time: string | null; location: string | null }
export interface ApplicantTotal { name: string; total: number }

export interface MemberAttendance {
  name: string;
  team: string | null;
  rate: number | null;
  unexcused: number;
  tardy: number;
  excused: number;
}
export interface OwnAttendance {
  rate: number | null;
  unexcused: number;
  tardy: number;
  excused: number;
  totalSessions: number;
}
export interface QuarterProjectRow {
  id: string;
  client_name: string;
  status: string;
  health: string;
  deadline: string | null;
  pm: string | null;
  sc: string | null;
}
export interface DirectoryEntry { id: string; name: string; role: string; team: string | null }
export interface TeamTaskRow {
  id: string;
  task_name: string;
  due_date: string | null;
  status: string;
  priority: string;
  task_type: string;
  project_id: string;
  project: string | null;
  assignee_id: string | null;
  assignee: string | null;
}
export interface ProjectDetailRow {
  id: string;
  client_name: string;
  status: string;
  health: string;
  deadline: string | null;
  pm: string | null;
  sc: string | null;
  members: { name: string; team_role: string }[];
}
export interface WikiPageRow { title: string; slug: string; section: string; body: string; updated_at: string }
export interface QuickLinkRow { title: string; url: string; description: string | null; category: string | null }
export interface NotificationRow { message: string; href: string; occurredAt: string }
export interface SearchHit { type: string; title: string; subtitle: string | null; href: string }
export interface MemberStatsRow {
  name: string;
  role: string;
  team: string;
  attendanceRate: number | null;
  tasksDone: number;
  tasksTotal: number;
  overdueTasks: number;
}
export interface ActivityRow { action: string; target: string | null; detail: string | null; actor: string; at: string }
export interface AttentionRow { label: string; href: string }

/** Injected seam over the existing data layer so tools are unit-testable without Supabase. */
export interface DataAccess {
  activeQuarter(): Promise<{ id: string; name: string } | null>;
  myProjects(userId: string, quarterId: string): Promise<ProjectRow[]>;
  myOpenTasks(userId: string, quarterId: string): Promise<TaskRow[]>;
  /** Open items on the shared exec to-do list. Callers must only use this for execs. */
  openExecTodos(): Promise<ExecTodoRow[]>;
  upcomingEvents(): Promise<EventRow[]>;
  topApplicants(quarterId: string): Promise<ApplicantTotal[]>;
  attendanceByMember(quarterId: string): Promise<MemberAttendance[]>;
  myAttendance(userId: string, quarterId: string): Promise<OwnAttendance>;
  quarterProjects(quarterId: string): Promise<QuarterProjectRow[]>;
  directory(quarterId: string): Promise<DirectoryEntry[]>;
  /** Every task the caller can see in the quarter (RLS scopes it), optionally narrowed. */
  tasks(quarterId: string, filters: { projectId?: string; assigneeId?: string; status?: string }): Promise<TeamTaskRow[]>;
  projectDetail(projectId: string): Promise<ProjectDetailRow>;
  /** `canViewPm` mirrors the Resources page: PM-section pages are for elevated roles only. */
  wikiPages(canViewPm: boolean): Promise<WikiPageRow[]>;
  quickLinks(): Promise<QuickLinkRow[]>;
  notifications(userId: string, isExec: boolean): Promise<{ items: NotificationRow[]; unreadCount: number }>;
  search(query: string): Promise<SearchHit[]>;
  memberStats(quarterId: string): Promise<MemberStatsRow[]>;
  activityLog(limit: number): Promise<ActivityRow[]>;
  attentionItems(quarterId: string): Promise<AttentionRow[]>;
}

export interface ToolDeps {
  profile: { id: string; name: string; role: UserRole };
  rowCap: number;
  data: DataAccess;
}

export interface ReadResult<T> {
  items: T[];
  total: number;
  truncated: boolean;
  note?: string;
}
