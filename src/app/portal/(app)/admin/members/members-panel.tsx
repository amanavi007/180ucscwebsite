"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABELS, roleLabel } from "@/lib/auth/roles";
import { ListSearch } from "@/components/list-search";
import { useFilteredList } from "@/lib/use-filtered-list";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/database.types";
import type { MembersAction } from "@/lib/admin-nav";
import { ROLE_OPTIONS, type Member, type ArchivedMember } from "./member-types";
import { BulkAddDialog } from "./bulk-add-dialog";
import { MemberRow } from "./member-row";
import { ArchivedSection } from "./archived-members";

type MemberSortKey = "name" | "role";
type SortDir = "asc" | "desc";

const MEMBER_SORT_ACCESSORS: Record<MemberSortKey, (m: Member) => string> = {
  name: (m) => m.name,
  role: (m) => roleLabel(m.role),
};

function SortableMemberHead({
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
        className={cn(
          "flex items-center gap-1 hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

const ROLE_CHIPS: { value: UserRole | "all"; label: string }[] = [
  { value: "all", label: "All" },
  ...ROLE_OPTIONS.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
];

export function MembersPanel({
  members,
  archivedMembers,
  defaultPassword,
  action,
}: {
  members: Member[];
  archivedMembers: ArchivedMember[];
  defaultPassword: string;
  action: MembersAction | null;
}) {
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [sortKey, setSortKey] = useState<MemberSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { query, setQuery, filtered: searchedMembers } = useFilteredList<Member>(members, [
    "name",
    "email",
  ]);
  const roleFiltered =
    roleFilter === "all" ? searchedMembers : searchedMembers.filter((m) => m.role === roleFilter);

  function onSort(key: MemberSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visibleMembers = useMemo(() => {
    if (!sortKey) return roleFiltered;
    const accessor = MEMBER_SORT_ACCESSORS[sortKey];
    const copy = [...roleFiltered];
    copy.sort((a, b) => {
      const cmp = accessor(a).localeCompare(accessor(b));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [roleFiltered, sortKey, sortDir]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            {members.length} active · {archivedMembers.length} archived
          </p>
        </div>
        <BulkAddDialog defaultPassword={defaultPassword} defaultOpen={action === "bulk-add"} />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active {members.length}</TabsTrigger>
          <TabsTrigger value="archived">Archived {archivedMembers.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <ListSearch
              value={query}
              onChange={setQuery}
              placeholder="Search name or email..."
              className="w-64"
              autoFocus={action === "find"}
            />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by role">
              {ROLE_CHIPS.map((chip) => {
                const active = roleFilter === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRoleFilter(chip.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableMemberHead label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                <TableHead>Email</TableHead>
                <SortableMemberHead label="Role" sortKey="role" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMembers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {members.length === 0 ? "No members yet." : "No members match."}
                  </TableCell>
                </TableRow>
              )}
              {visibleMembers.map((m) => (
                <MemberRow key={m.id} member={m} defaultPassword={defaultPassword} />
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="archived" className="pt-4">
          <ArchivedSection archivedMembers={archivedMembers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
