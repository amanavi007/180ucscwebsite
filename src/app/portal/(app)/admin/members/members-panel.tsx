"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { FilterChip } from "@/components/filter-chip";
import { UrlTabs } from "@/components/url-tabs";
import { ROLE_LABELS, compareByRole, isExec } from "@/lib/auth/roles";
import { ListSearch } from "@/components/list-search";
import { useFilteredList } from "@/lib/use-filtered-list";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/database.types";
import type { MembersAction } from "@/lib/admin-nav";
import { ROLE_OPTIONS, needsCheckIn, type Member, type ArchivedMember, type MemberStats } from "./member-types";
import { BulkAddDialog } from "./bulk-add-dialog";
import { MemberRow } from "./member-row";
import { MemberInspector } from "./member-inspector";
import { ArchivedSection } from "./archived-members";

type MemberSortKey = "name" | "role" | "attendance";
type SortDir = "asc" | "desc";
/** "exec" is every exec role in one filter; the rest are single roles. */
type RoleFilter = "all" | "exec" | "checkin" | UserRole;

const NON_EXEC_ROLES = ROLE_OPTIONS.filter((r) => !isExec(r));

function SortableHead({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: MemberSortKey;
  activeKey: MemberSortKey | null;
  dir: SortDir;
  onSort: (key: MemberSortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  const Icon = isActive ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("flex items-center gap-1 uppercase hover:text-foreground", isActive ? "text-foreground" : "text-muted-foreground")}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

export function MembersPanel({
  members,
  archivedMembers,
  defaultPassword,
  action,
  stats,
  attendanceThreshold,
  quarterName,
}: {
  members: Member[];
  archivedMembers: ArchivedMember[];
  defaultPassword: string;
  action: MembersAction | null;
  stats: Record<string, MemberStats>;
  attendanceThreshold: number;
  quarterName: string | null;
}) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortKey, setSortKey] = useState<MemberSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { query, setQuery, filtered: searchedMembers } = useFilteredList<Member>(members, ["name", "email"]);

  const counts = useMemo(() => {
    const byRole = new Map<UserRole, number>();
    for (const m of members) byRole.set(m.role, (byRole.get(m.role) ?? 0) + 1);
    return {
      exec: members.filter((m) => isExec(m.role)).length,
      checkin: members.filter((m) => needsCheckIn(stats[m.id], attendanceThreshold)).length,
      byRole,
    };
  }, [members, stats, attendanceThreshold]);

  const roleFiltered = searchedMembers.filter((m) => {
    if (roleFilter === "all") return true;
    if (roleFilter === "exec") return isExec(m.role);
    if (roleFilter === "checkin") return needsCheckIn(stats[m.id], attendanceThreshold);
    return m.role === roleFilter;
  });

  function onSort(key: MemberSortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const selectedMember = members.find((m) => m.id === selectedId) ?? null;

  const visibleMembers = useMemo(() => {
    const copy = [...roleFiltered];
    if (!sortKey) return copy.sort(compareByRole); // default: seniority, then name
    const rate = (m: Member) => stats[m.id]?.attendanceRate ?? -1;
    const compare =
      sortKey === "name"
        ? (a: Member, b: Member) => a.name.localeCompare(b.name)
        : sortKey === "role"
          ? compareByRole
          : (a: Member, b: Member) => rate(a) - rate(b);
    return copy.sort((a, b) => (sortDir === "asc" ? compare(a, b) : -compare(a, b)));
  }, [roleFiltered, sortKey, sortDir, stats]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        description={`${members.length} active · ${archivedMembers.length} archived${quarterName ? ` · ${quarterName}` : ""}`}
        actions={<BulkAddDialog defaultPassword={defaultPassword} defaultOpen={action === "bulk-add"} />}
      />

      <UrlTabs values={["active", "archived"]} fallback="active">
        <TabsList>
          <TabsTrigger value="active">Active {members.length}</TabsTrigger>
          <TabsTrigger value="archived">Archived {archivedMembers.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="pt-4">
          <div className={cn("grid items-start gap-6", selectedMember && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <ListSearch
                  value={query}
                  onChange={setQuery}
                  placeholder="Search name or email..."
                  className="w-64"
                  autoFocus={action === "find"}
                />
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter people">
                  <FilterChip selected={roleFilter === "all"} onClick={() => setRoleFilter("all")} count={members.length}>
                    All
                  </FilterChip>
                  <FilterChip selected={roleFilter === "exec"} onClick={() => setRoleFilter("exec")} count={counts.exec}>
                    Exec board
                  </FilterChip>
                  {NON_EXEC_ROLES.filter((r) => counts.byRole.get(r)).map((r) => (
                    <FilterChip key={r} selected={roleFilter === r} onClick={() => setRoleFilter(r)} count={counts.byRole.get(r)}>
                      {ROLE_LABELS[r]}
                    </FilterChip>
                  ))}
                  {counts.checkin > 0 && (
                    <FilterChip selected={roleFilter === "checkin"} onClick={() => setRoleFilter("checkin")} count={counts.checkin}>
                      Needs a check-in
                    </FilterChip>
                  )}
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                    <SortableHead label="Role" sortKey="role" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                    <TableHead>Team</TableHead>
                    <SortableHead label="Attendance" sortKey="attendance" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleMembers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        {members.length === 0 ? "No members yet. Add the first ones with Add members." : "No one matches that."}
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleMembers.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      stats={stats[m.id]}
                      threshold={attendanceThreshold}
                      selected={m.id === selectedId}
                      onSelect={() => setSelectedId(m.id)}
                    />
                  ))}
                </TableBody>
              </Table>
              <p className="text-sm text-muted-foreground">
                Select a person to change their role or email, reset their password, or archive them. &ldquo;Needs a check-in&rdquo; means
                attendance is under the alert threshold or they have overdue tasks.
              </p>
            </div>
            {selectedMember && (
              <MemberInspector
                key={selectedMember.id}
                member={selectedMember}
                stats={stats[selectedMember.id]}
                defaultPassword={defaultPassword}
                onClose={() => setSelectedId(null)}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="archived" className="pt-4">
          <ArchivedSection archivedMembers={archivedMembers} />
        </TabsContent>
      </UrlTabs>
    </div>
  );
}
