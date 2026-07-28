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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={selectedQuarterId ?? undefined}
          onValueChange={(value) => router.push(`/projects?quarter=${value}`)}
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
          <ProjectBoard projects={projects} currentUserId={currentUserId} isExec={isExec} />
        </TabsContent>
        <TabsContent value="table">
          <ProjectTable projects={projects} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
