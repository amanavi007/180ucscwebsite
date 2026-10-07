import type { UserRole } from "@/lib/supabase/database.types";

export interface ProjectRow { id: string; client_name: string; status: string; health: string; deadline: string | null }
export interface TaskRow {
  id: string; task_name: string; due_date: string | null; status: string; priority: string;
  project: { client_name: string } | null;
}
export interface EventRow { date: string; title: string; type: string; time: string | null; location: string | null }
export interface ApplicantTotal { name: string; total: number }

/** Injected seam over the existing data layer so tools are unit-testable without Supabase. */
export interface DataAccess {
  activeQuarter(): Promise<{ id: string; name: string } | null>;
  myProjects(userId: string, quarterId: string): Promise<ProjectRow[]>;
  myOpenTasks(userId: string, quarterId: string): Promise<TaskRow[]>;
  upcomingEvents(): Promise<EventRow[]>;
  topApplicants(quarterId: string): Promise<ApplicantTotal[]>;
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
