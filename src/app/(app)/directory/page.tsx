import { getDirectory } from "@/lib/data/directory";
import { getActiveQuarter } from "@/lib/data/quarters";
import { DirectoryView } from "./directory-view";

export default async function DirectoryPage() {
  const activeQuarter = await getActiveQuarter();
  const rows = await getDirectory(activeQuarter?.id ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Directory</h1>
        <p className="text-sm text-muted-foreground">
          Every member and their current team{activeQuarter ? ` · ${activeQuarter.name}` : ""}.
        </p>
      </div>

      <DirectoryView rows={rows} />
    </div>
  );
}
