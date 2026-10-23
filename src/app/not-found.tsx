import type { Metadata } from "next";
import { ErrorScreen } from "@/components/error-screen";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return <ErrorScreen variant="not-found" action={{ href: "/" }} />;
}
