import { ErrorScreen } from "@/components/error-screen";

export default function PortalNotFound() {
  return <ErrorScreen variant="not-found" action={{ href: "/portal" }} inShell />;
}
