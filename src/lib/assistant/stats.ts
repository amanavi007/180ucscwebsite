export interface StatsInput {
  todayIso: string;
  tasks: { status: string; due_date: string | null }[];
  projectCount: number;
  attendanceRate: number | null;
}
export interface Stats {
  openTasks: number;
  overdueTasks: number;
  projects: number;
  attendancePct: number | null;
}

export function computeStats(i: StatsInput): Stats {
  const open = i.tasks.filter((t) => t.status !== "done");
  return {
    openTasks: open.length,
    overdueTasks: open.filter((t) => t.due_date !== null && t.due_date < i.todayIso).length,
    projects: i.projectCount,
    attendancePct: i.attendanceRate === null ? null : Math.round(i.attendanceRate * 100),
  };
}
