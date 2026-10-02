import type { Metadata } from "next";
import { getBookingByToken } from "@/lib/data/coffee-chat-public";
import { ManageView } from "./manage-view";

export const metadata: Metadata = { title: "Manage Your Coffee Chat" };

export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBookingByToken(token);

  return (
    <div className="mx-auto max-w-xl px-4 pt-28 pb-24 sm:px-6">
      <h1 className="font-brand text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        Manage your coffee chat
      </h1>
      <div className="mint-panel mt-10 rounded-[2.5rem] p-8 sm:p-10">
        <ManageView token={token} booking={booking} />
      </div>
    </div>
  );
}
