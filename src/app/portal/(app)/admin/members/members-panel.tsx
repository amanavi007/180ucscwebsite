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
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { FilterChip } from "@/components/filter-chip";
import { UrlTabs } from "@/components/url-tabs";
import { ROLE_LABELS, compareByRole } from "@/lib/auth/roles";
import { ListSearch } from "@/components/list-search";
import { useFilteredList } from "@/lib/use-filtered-list";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/supabase/database.types";
import type { MembersAction } from "@/lib/admin-nav";
import { ROLE_OPTIONS, type Member, type ArchivedMember } from "./member-types";
import { BulkAddDialog } from "./bulk-add-dialog";
import { MemberRow } from "./member-row";
import { MemberInspector } from "./member-inspector";
import { ArchivedSection } from "./archived-members";

type MemberSortKey = "name" | "role";
type SortDir = "asc" | "desc";

const MEMBER_COMPARATORS: Record<MemberSortKey, (a: Member, b: Member) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  role: compareByRole, // seniority, not alphabetical by role label
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selectedMember = members.find((m) => m.id === selectedId) ?? null;

  const visibleMembers = useMemo(() => {
    const copy = [...roleFiltered];
    if (!sortKey) return copy.sort(compareByRole); // default: seniority, then name
    const compare = MEMBER_COMPARATORS[sortKey];
    return copy.sort((a, b) => (sortDir === "asc" ? compare(a, b) : -compare(a, b)));
  }, [roleFiltered, sortKey, sortDir]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description={`${members.length} active · ${archivedMembers.length} archived`}
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
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by role">
                  {ROLE_CHIPS.map((chip) => (
                    <FilterChip key={chip.value} selected={roleFilter === chip.value} onClick={() => setRoleFilter(chip.value)}>
                      {chip.label}
                    </FilterChip>
                  ))}
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableMemberHead label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                    <TableHead>Email</TableHead>
                    <SortableMemberHead label="Role" sortKey="role" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleMembers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        {members.length === 0 ? "No members yet. Add the first ones with Add members." : "No members match."}
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleMembers.map((m) => (
                    <MemberRow key={m.id} member={m} selected={m.id === selectedId} onSelect={() => setSelectedId(m.id)} />
                  ))}
                </TableBody>
              </Table>
              <p className="text-sm text-muted-foreground">Select a person to change their role or email, reset their password, or archive them.</p>
            </div>
            {selectedMember && (
              <MemberInspector
                key={selectedMember.id}
                member={selectedMember}
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
