import type { UserRole } from "@/lib/supabase/database.types";

export interface ProjectRow { id: string; client_name: string; status: string; health: string; deadline: string | null }
export interface TaskRow {
  id: string; task_name: string; due_date: string | null; status: string; priority: string;
  project: { client_name: string } | null;
}
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
export interface DirectoryEntry { name: string; role: string; team: string | null }

/** Injected seam over the existing data layer so tools are unit-testable without Supabase. */
export interface DataAccess {
  activeQuarter(): Promise<{ id: string; name: string } | null>;
  myProjects(userId: string, quarterId: string): Promise<ProjectRow[]>;
  myOpenTasks(userId: string, quarterId: string): Promise<TaskRow[]>;
  upcomingEvents(): Promise<EventRow[]>;
  topApplicants(quarterId: string): Promise<ApplicantTotal[]>;
  attendanceByMember(quarterId: string): Promise<MemberAttendance[]>;
  myAttendance(userId: string, quarterId: string): Promise<OwnAttendance>;
  quarterProjects(quarterId: string): Promise<QuarterProjectRow[]>;
  directory(quarterId: string): Promise<DirectoryEntry[]>;
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
