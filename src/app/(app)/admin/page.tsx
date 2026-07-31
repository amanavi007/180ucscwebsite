import type { Metadata } from "next";
import { getAllProfiles, getArchivedProfiles } from "@/lib/data/members";
import { getDefaultBulkPassword } from "@/lib/data/org-settings";
import { MembersPanel } from "./members-panel";

export const metadata: Metadata = { title: "Admin · Members" };

export default async function AdminMembersPage() {
  const [members, archivedMembers, defaultPassword] = await Promise.all([
    getAllProfiles(),
    getArchivedProfiles(),
    getDefaultBulkPassword(),
  ]);
  return (
    <MembersPanel members={members} archivedMembers={archivedMembers} defaultPassword={defaultPassword} />
  );
}
