import type { Metadata } from "next";
import { ErrorScreen } from "@/components/error-screen";

export const metadata: Metadata = { title: "Signed out", robots: { index: false } };

export default function SessionExpiredPage() {
  return <ErrorScreen variant="expired" action={{ href: "/login" }} />;
}
