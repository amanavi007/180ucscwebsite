import { describe, expect, it } from "vitest";
import { computeStats } from "./stats";

describe("computeStats", () => {
  it("counts open and overdue tasks as of a given day", () => {
    const s = computeStats({
      todayIso: "2026-10-07",
      tasks: [
        { status: "done", due_date: "2026-10-01" },
        { status: "in_progress", due_date: "2026-10-05" },
        { status: "not_started", due_date: "2026-10-09" },
        { status: "not_started", due_date: null },
      ],
      projectCount: 2,
      attendanceRate: 0.9166,
    });
    expect(s).toEqual({ openTasks: 3, overdueTasks: 1, projects: 2, attendancePct: 92 });
  });
  it("returns null attendance when unknown", () => {
    expect(computeStats({ todayIso: "2026-10-07", tasks: [], projectCount: 0, attendanceRate: null }).attendancePct).toBeNull();
  });
});
