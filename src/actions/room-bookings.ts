"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/data/profile";
import { isExec } from "@/lib/auth/roles";

export interface ActionResult {
  error?: string;
}

async function requireExec() {
  const profile = await getCurrentProfile();
  if (!isExec(profile.role)) {
    return { error: "Only exec can do that." } as const;
  }
  return { error: undefined } as const;
}

/** Sets (or clears, if roomName is null) a team's room for a given meeting date. */
export async function setRoomBooking(
  projectId: string,
  date: string,
  roomName: string | null,
): Promise<ActionResult> {
  const denied = await requireExec();
  if (denied.error) return { error: denied.error };

  const supabase = await createClient();

  if (roomName === null || roomName.trim() === "") {
    const { error } = await supabase
      .from("room_bookings")
      .delete()
      .eq("project_id", projectId)
      .eq("date", date);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("room_bookings")
      .upsert(
        { project_id: projectId, date, room_name: roomName.trim() },
        { onConflict: "project_id,date" },
      );
    if (error) return { error: error.message };
  }

  revalidatePath("/portal/admin/rooms");
  revalidatePath("/portal/attendance");
  revalidatePath("/portal");
  return {};
}
