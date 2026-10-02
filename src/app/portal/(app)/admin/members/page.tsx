import type { Metadata } from "next";
import { getAllProfiles, getArchivedProfiles } from "@/lib/data/members";
import { getDefaultBulkPassword } from "@/lib/data/org-settings";
import { parseMembersAction } from "@/lib/admin-nav";
import { MembersPanel } from "./members-panel";

export const metadata: Metadata = { title: "Admin · Members" };

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const [{ action }, members, archivedMembers, defaultPassword] = await Promise.all([
    searchParams,
    getAllProfiles(),
    getArchivedProfiles(),
    getDefaultBulkPassword(),
  ]);
  return (
    <MembersPanel
      members={members}
      archivedMembers={archivedMembers}
      defaultPassword={defaultPassword}
      action={parseMembersAction(action)}
    />
  );
}
