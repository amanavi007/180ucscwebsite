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
    return { error: "Only exec can edit the room map." } as const;
  }
  return { error: undefined } as const;
}

export interface RoomHotspotInput {
  /** Present for an existing hotspot being edited; omitted for a brand-new one. */
  id?: string;
  name: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Replaces the full set of room hotspots with the given list. The editor
 * hands over "here's the new desired state" rather than separate
 * create/update/delete calls, so a dragged reposition, a rename, a removed
 * room, and a brand-new one can all be saved in one action + one refresh.
 */
export async function updateRoomHotspots(hotspots: RoomHotspotInput[]): Promise<ActionResult> {
  const access = await requireExec();
  if (access.error) return { error: access.error };

  for (const h of hotspots) {
    if (!h.name.trim()) return { error: "Every room needs a name." };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase.from("room_hotspots").select("id");
  if (fetchError) return { error: fetchError.message };

  const keepIds = new Set(hotspots.filter((h) => h.id).map((h) => h.id!));
  const toDeleteIds = (existing ?? []).filter((row) => !keepIds.has(row.id)).map((row) => row.id);

  if (toDeleteIds.length > 0) {
    const { error } = await supabase.from("room_hotspots").delete().in("id", toDeleteIds);
    if (error) return { error: error.message };
  }

  for (const h of hotspots.filter((h) => h.id)) {
    const { error } = await supabase
      .from("room_hotspots")
      .update({ name: h.name.trim(), top: h.top, left: h.left, width: h.width, height: h.height })
      .eq("id", h.id!);
    if (error) return { error: error.message };
  }

  const toInsert = hotspots
    .filter((h) => !h.id)
    .map((h) => ({
      name: h.name.trim(),
      top: h.top,
      left: h.left,
      width: h.width,
      height: h.height,
    }));
  if (toInsert.length > 0) {
    const { error } = await supabase.from("room_hotspots").insert(toInsert);
    if (error) return { error: error.message };
  }

  revalidatePath("/portal/admin/rooms");
  return {};
}
