import type { Metadata } from "next";
import { getClientMeetingByToken } from "@/lib/data/client-meeting-public";
import { ManageView } from "./manage-view";

export const metadata: Metadata = { title: "Manage Your Intro Call" };

export const dynamic = "force-dynamic";

export default async function ManageClientMeetingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const meeting = await getClientMeetingByToken(token);

  return (
    <div className="mx-auto max-w-xl px-4 pt-28 pb-24 sm:px-6">
      <h1 className="font-brand text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        Manage your intro call
      </h1>
      <div className="mint-panel mt-10 rounded-[2.5rem] p-8 sm:p-10">
        <ManageView token={token} meeting={meeting} />
      </div>
    </div>
  );
}
