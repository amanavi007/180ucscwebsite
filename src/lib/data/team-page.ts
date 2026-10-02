import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/supabase/database.types";
import { compareByRole } from "@/lib/auth/roles";
import { teamPhotoUrl, type PublicTeamMember, type TeamProfileRow } from "@/lib/team-page";

const ROW_COLUMNS =
  "bio, linkedin_url, major, photo_path, listed, pending_bio, pending_linkedin_url, pending_major, pending_photo_path, pending_submitted_at" as const;

/**
 * Public team page source. Uses the service-role client so the table needs no
 * public RLS policy, and selects only the public columns. Never throws: a
 * failure here must not take the marketing page down.
 */
export async function getPublicTeamMembers(): Promise<PublicTeamMember[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("team_profiles")
      .select("profile_id, bio, linkedin_url, major, photo_path, profile:profiles(name, role, archived_at)")
      .eq("listed", true);
    if (error) throw error;

    const rows = data as unknown as {
      profile_id: string;
      bio: string | null;
      linkedin_url: string | null;
      major: string | null;
      photo_path: string | null;
      profile: { name: string; role: UserRole; archived_at: string | null } | null;
    }[];
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;

    return rows
      .filter((r) => r.profile && !r.profile.archived_at && r.photo_path && r.linkedin_url && r.major)
      .map((r) => ({
        id: r.profile_id,
        name: r.profile!.name,
        role: r.profile!.role,
        bio: r.bio,
        linkedinUrl: r.linkedin_url!,
        major: r.major!,
        photoUrl: teamPhotoUrl(base, r.photo_path!),
      }));
  } catch (err) {
    console.error("getPublicTeamMembers failed:", err);
    return [];
  }
}

export async function getMyTeamProfileRow(profileId: string): Promise<TeamProfileRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_profiles")
    .select(ROW_COLUMNS)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface TeamPageAdminRow {
  id: string;
  name: string;
  role: UserRole;
  profileLinkedin: string | null;
  row: TeamProfileRow | null;
}

/** Exec-only (RLS lets execs read every team_profiles row). One entry per active member. */
export async function getTeamPageAdminRows(): Promise<TeamPageAdminRow[]> {
  const supabase = await createClient();
  const [profilesRes, rowsRes] = await Promise.all([
    supabase.from("profiles").select("id, name, role, linkedin_url").is("archived_at", null).order("name"),
    supabase.from("team_profiles").select(`profile_id, ${ROW_COLUMNS}`),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (rowsRes.error) throw rowsRes.error;

  const byId = new Map(rowsRes.data.map(({ profile_id, ...row }) => [profile_id, row as TeamProfileRow]));
  return profilesRes.data
    .map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      profileLinkedin: p.linkedin_url,
      row: byId.get(p.id) ?? null,
    }))
    .sort(compareByRole);
}

/** Nav badge count. Fails soft (0): it renders in the shared Admin layout and must never break every Admin page. */
export async function getPendingTeamSubmissionCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("team_profiles")
    .select("profile_id", { count: "exact", head: true })
    .not("pending_submitted_at", "is", null);
  if (error) {
    console.error("getPendingTeamSubmissionCount failed:", error.message);
    return 0;
  }
  return count ?? 0;
}
