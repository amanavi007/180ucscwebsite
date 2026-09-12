import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type RoomHotspot = Database["public"]["Tables"]["room_hotspots"]["Row"];

/**
 * The clickable room boxes overlaid on the floor plan image for Admin >
 * Rooms, in database insertion order (stable enough for the map -- exec can
 * reorder/rename/reposition them from the editor UI without a code change).
 */
export async function getRoomHotspots(): Promise<RoomHotspot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_hotspots")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}
