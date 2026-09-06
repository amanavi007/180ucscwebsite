import type { Metadata } from "next";

export const metadata: Metadata = { title: "Set password" };

export default function ForcePasswordResetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
