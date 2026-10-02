"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { getMeetingDatesInRange } from "@/lib/attendance";
import { invalidateActiveQuarterCache } from "@/lib/data/quarters";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can manage quarters." } as ActionResult;
  }
  return null;
}

export async function createQuarter(input: {
  name: string;
  startDate: string;
  endDate: string;
  makeActive: boolean;
}): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();

  if (input.makeActive) {
    await supabase.from("quarters").update({ is_active: false }).eq("is_active", true);
  }

  const { data: quarter, error } = await supabase
    .from("quarters")
    .insert({
      name: input.name,
      start_date: input.startDate,
      end_date: input.endDate,
      is_active: input.makeActive,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Auto-seed the default Tue/Thu meeting calendar; exec can adjust it in Admin > Meeting Days.
  const seedDates = getMeetingDatesInRange(input.startDate, input.endDate);
  if (seedDates.length > 0) {
    await supabase
      .from("meeting_dates")
      .insert(seedDates.map((date) => ({ quarter_id: quarter.id, date })));
  }

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "quarter.created", input.name);

  if (input.makeActive) invalidateActiveQuarterCache();
  revalidatePath("/portal/admin");
  return {};
}

export async function setActiveQuarter(quarterId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();

  await supabase.from("quarters").update({ is_active: false }).eq("is_active", true);
  const { data: quarter, error } = await supabase
    .from("quarters")
    .update({ is_active: true })
    .eq("id", quarterId)
    .select("name")
    .single();

  if (error) return { error: error.message };

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "quarter.activated", quarter.name);

  invalidateActiveQuarterCache();
  revalidatePath("/portal/admin");
  return {};
}

export async function deactivateQuarter(quarterId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();
  const { data: quarter, error } = await supabase
    .from("quarters")
    .update({ is_active: false })
    .eq("id", quarterId)
    .select("name")
    .single();

  if (error) return { error: error.message };

  const actor = await getCurrentProfile();
  await logAudit(actor.id, "quarter.deactivated", quarter.name);

  invalidateActiveQuarterCache();
  revalidatePath("/portal/admin");
  return {};
}

export async function updateQuarter(
  quarterId: string,
  input: { name: string; startDate: string; endDate: string },
): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase
    .from("quarters")
    .update({ name: input.name, start_date: input.startDate, end_date: input.endDate })
    .eq("id", quarterId);

  if (error) return { error: error.message };

  revalidatePath("/portal/admin");
  return {};
}

export async function deleteQuarter(quarterId: string): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied) return denied;

  const supabase = await createClient();

  // Fetched before the delete purely for the audit trail: quarter.quarter_id
  // cascades, so this row and count would otherwise be unrecoverable context.
  const [{ data: quarter }, { count: projectCount }] = await Promise.all([
    supabase.from("quarters").select("name").eq("id", quarterId).single(),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("quarter_id", quarterId),
  ]);

  const { error } = await supabase.from("quarters").delete().eq("id", quarterId);

  if (error) return { error: error.message };

  const actor = await getCurrentProfile();
  await logAudit(
    actor.id,
    "quarter.deleted",
    quarter?.name,
    projectCount ? `Cascaded ${projectCount} project(s)` : undefined,
  );

  invalidateActiveQuarterCache();
  revalidatePath("/portal/admin");
  revalidatePath("/portal/projects");
  revalidatePath("/portal/directory");
  revalidatePath("/portal");
  revalidatePath("/portal/attendance");
  return {};
}
