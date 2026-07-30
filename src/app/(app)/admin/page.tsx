import type { Metadata } from "next";
import { getAllProfiles } from "@/lib/data/members";
import { getDefaultBulkPassword } from "@/lib/data/org-settings";
import { MembersPanel } from "./members-panel";

export const metadata: Metadata = { title: "Admin · Members" };

export default async function AdminMembersPage() {
  const [members, defaultPassword] = await Promise.all([getAllProfiles(), getDefaultBulkPassword()]);
  return <MembersPanel members={members} defaultPassword={defaultPassword} />;
}
