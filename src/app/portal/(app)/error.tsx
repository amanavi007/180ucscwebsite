"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/error-screen";

export default function PortalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorScreen variant="error" action={{ onClick: unstable_retry }} digest={error.digest} inShell />;
}
