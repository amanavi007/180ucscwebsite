"use server";

import { getCurrentProfile } from "@/lib/data/profile";
import { getQuarterExportRows, type QuarterExportRow } from "@/lib/data/quarter-export";
import { isExec } from "@/lib/auth/roles";

export async function exportQuarterCsv(
  quarterId: string,
): Promise<{ error?: string; rows?: QuarterExportRow[] }> {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can do that." };
  }

  const rows = await getQuarterExportRows(quarterId);
  return { rows };
}
