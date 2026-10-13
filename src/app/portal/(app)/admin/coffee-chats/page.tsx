import { redirect } from "next/navigation";

/** Coffee chats, interviews and client calls now live together on the Scheduling page. Old links and emails still land there. */
export default function Page() {
  redirect("/portal/admin/scheduling");
}
