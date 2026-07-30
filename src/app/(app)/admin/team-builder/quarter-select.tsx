"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function QuarterSelect({
  quarters,
  selectedId,
}: {
  quarters: { id: string; name: string; is_active: boolean }[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <Select
      value={selectedId}
      onValueChange={(v) => router.push(`/admin/team-builder?quarter=${v}`)}
    >
      <SelectTrigger size="sm" className="w-56">
        <SelectValue>
          {(value: string) => {
            const q = quarters.find((qq) => qq.id === value);
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
  );
}
