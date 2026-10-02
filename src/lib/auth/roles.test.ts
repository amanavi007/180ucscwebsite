import { describe, expect, it } from "vitest";
import { ROLE_LABELS, ROLE_RANK, compareByRole } from "./roles";
import type { UserRole } from "../supabase/database.types";

const member = (name: string, role: UserRole) => ({ name, role });

describe("ROLE_RANK", () => {
  it("ranks every role exactly once, with no gaps", () => {
    const roles = Object.keys(ROLE_LABELS) as UserRole[];
    expect(roles.map((r) => ROLE_RANK[r]).sort((a, b) => a - b)).toEqual(roles.map((_, i) => i));
  });
  it("runs president, directors, PM, SC, consultant, junior", () => {
    const ordered = (Object.keys(ROLE_RANK) as UserRole[]).sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]);
    expect(ordered).toEqual([
      "president",
      "director_of_projects",
      "director_of_internal_affairs",
      "director_of_external_affairs",
      "director_of_training",
      "director_of_marketing",
      "project_manager",
      "senior_consultant",
      "consultant",
      "junior_consultant",
    ]);
  });
});

describe("compareByRole", () => {
  it("sorts by seniority first, then by name case-insensitively", () => {
    const sorted = [
      member("bob", "consultant"),
      member("Zed", "president"),
      member("Cy", "senior_consultant"),
      member("Alice", "junior_consultant"),
      member("Pam", "project_manager"),
      member("amy", "consultant"),
      member("Dee", "director_of_marketing"),
    ].sort(compareByRole);
    expect(sorted.map((m) => m.name)).toEqual(["Zed", "Dee", "Pam", "Cy", "amy", "bob", "Alice"]);
  });
  it("returns 0 for the same role and name", () => {
    expect(compareByRole(member("A", "consultant"), member("a", "consultant"))).toBe(0);
  });
});
