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
  members: { id: string; name: string; team_role: string }[];
}
export interface WikiPageRow { id: string; parent_id: string | null; title: string; slug: string; section: string; body: string; updated_at: string }
export interface QuickLinkRow { id: string; title: string; url: string; description: string | null; category: string | null }
export interface NotificationRow { message: string; href: string; occurredAt: string }
export interface SearchHit { type: string; title: string; subtitle: string | null; href: string }
export interface ApplicantDetail {
  id: string;
  name: string;
  email: string | null;
  major: string | null;
  year: string | null;
  notes: string;
  total: number;
  entries: { id: string; category: string; event: string | null; points: number; reason: string | null; voided: boolean }[];
}
export interface RecruitSetup {
  categories: { id: string; name: string; section: string; defaultPoints: number; archived: boolean }[];
  events: { id: string; name: string; date: string; categoryId: string }[];
}
export interface QuarterInfo { id: string; name: string; start: string; end: string; isActive: boolean }
export interface ClientInfo { id: string; name: string; contact: string | null; projects: number; lastQuarter: string | null; current: boolean }
export interface AlumniInfo { userId: string; name: string; title: string | null; company: string | null; linkedin: string | null; projects: string[] }
export interface BookingInfo {
  kind: "coffee_chat" | "interview" | "client_meeting";
  id: string;
  who: string;
  date: string;
  start: string;
  end: string;
  status: string;
  withExecs: string[];
}
export interface PlanInfo { id: string; name: string; finalized: boolean }
export interface AttendanceSessionInfo { date: string; takenBy: string; excused: number; unexcused: number; tardy: number }
export interface TeamAttendanceInfo { projectId: string; client: string; loggedToday: boolean; missingDates: string[] }
export interface CalendarItem {
  id: string;
  kind: "meeting" | "deadline" | "event" | "project";
  date: string;
  title: string;
  time: string | null;
  location: string | null;
  description: string | null;
  canManage: boolean;
  projectId: string | null;
}
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
  /** Same feed with ids, so the assistant can edit or delete the item the user means. */
  calendarItems(): Promise<CalendarItem[]>;
  applicants(quarterId: string): Promise<ApplicantDetail[]>;
  recruitSetup(quarterId: string): Promise<RecruitSetup>;
  quarters(): Promise<QuarterInfo[]>;
  clients(): Promise<ClientInfo[]>;
  alumni(): Promise<AlumniInfo[]>;
  /** Coffee chat, interview and client-meeting bookings (exec only). */
  bookings(): Promise<BookingInfo[]>;
  meetingDates(quarterId: string): Promise<string[]>;
  teamPlans(quarterId: string): Promise<PlanInfo[]>;
  attendanceHistory(projectId: string): Promise<AttendanceSessionInfo[]>;
  teamAttendance(quarterId: string, todayIso: string): Promise<TeamAttendanceInfo[]>;
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
