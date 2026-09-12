"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListSearch } from "@/components/list-search";
import { useFilteredList } from "@/lib/use-filtered-list";
import { ProjectBoard } from "./project-board";
import { ProjectTable } from "./project-table";
import { NewProjectDialog } from "./new-project-dialog";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectWithRelations } from "@/lib/data/types";

type Quarter = Database["public"]["Tables"]["quarters"]["Row"];
type Profile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "name" | "role">;

export function ProjectsView({
  projects,
  quarters,
  selectedQuarterId,
  members,
  canCreate,
  currentUserId,
  isExec,
}: {
  projects: ProjectWithRelations[];
  quarters: Quarter[];
  selectedQuarterId: string | null;
  members: Profile[];
  canCreate: boolean;
  currentUserId: string;
  isExec: boolean;
}) {
  const router = useRouter();

  const { query, setQuery, filtered } = useFilteredList<ProjectWithRelations>(projects, [
    "client_name",
    (p) => p.project_manager?.name,
    (p) => p.senior_consultant?.name,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={selectedQuarterId ?? undefined}
            onValueChange={(value) => router.push(`/portal/projects?quarter=${value}`)}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select a quarter">
                {(value: string) => {
                  const q = quarters.find((q) => q.id === value);
                  return q ? `${q.name}${q.is_active ? " (active)" : ""}` : "Select a quarter";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {quarters.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.name}
                  {q.is_active ? " (active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ListSearch
            value={query}
            onChange={setQuery}
            placeholder="Search client or PM..."
            className="w-64"
          />
        </div>

        {canCreate && (
          <NewProjectDialog
            quarters={quarters}
            members={members}
            defaultQuarterId={selectedQuarterId}
          />
        )}
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="table">Table</TabsTrigger>
        </TabsList>
        <TabsContent value="board">
          <ProjectBoard projects={filtered} currentUserId={currentUserId} isExec={isExec} />
        </TabsContent>
        <TabsContent value="table">
          <ProjectTable projects={filtered} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
