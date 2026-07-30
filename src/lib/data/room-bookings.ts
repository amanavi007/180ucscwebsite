import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface RoomBooking {
  projectId: string;
  clientName: string;
  roomName: string | null;
}

/** Every team in the quarter + their room for a given date (null if not booked yet). */
export async function getRoomBookingsForDate(
  quarterId: string,
  date: string,
): Promise<RoomBooking[]> {
  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, client_name")
    .eq("quarter_id", quarterId)
    .order("client_name", { ascending: true });
  if (error) throw error;
  if (!projects || projects.length === 0) return [];

  const { data: bookings, error: bookingsError } = await supabase
    .from("room_bookings")
    .select("project_id, room_name")
    .eq("date", date)
    .in(
      "project_id",
      projects.map((p) => p.id),
    );
  if (bookingsError) throw bookingsError;

  const roomByProject = new Map((bookings ?? []).map((b) => [b.project_id, b.room_name]));

  return projects.map((p) => ({
    projectId: p.id,
    clientName: p.client_name,
    roomName: roomByProject.get(p.id) ?? null,
  }));
}

/** This project's room for a given date, or null if not booked. */
export async function getRoomBookingForProject(
  projectId: string,
  date: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("room_bookings")
    .select("room_name")
    .eq("project_id", projectId)
    .eq("date", date)
    .maybeSingle();
  return data?.room_name ?? null;
}
