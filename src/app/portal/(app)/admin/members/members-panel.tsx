"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, roleLabel } from "@/lib/auth/roles";
import { ListSearch } from "@/components/list-search";
import { useFilteredList } from "@/lib/use-filtered-list";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/database.types";
import { ROLE_OPTIONS, type Member, type ArchivedMember } from "./member-types";
import { BulkAddCard } from "./bulk-add-card";
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

export function MembersPanel({
  members,
  archivedMembers,
  defaultPassword,
}: {
  members: Member[];
  archivedMembers: ArchivedMember[];
  defaultPassword: string;
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
      <BulkAddCard defaultPassword={defaultPassword} />

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {members.length} member{members.length === 1 ? "" : "s"} total.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <ListSearch
              value={query}
              onChange={setQuery}
              placeholder="Search name or email..."
              className="w-64"
            />
            <Select value={roleFilter} onValueChange={(v) => v && setRoleFilter(v as UserRole | "all")}>
              <SelectTrigger size="sm" className="w-48">
                <SelectValue>
                  {(value: UserRole | "all") => (value === "all" ? "All roles" : roleLabel(value))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </CardContent>
      </Card>

      <ArchivedSection archivedMembers={archivedMembers} />
    </div>
  );
}
