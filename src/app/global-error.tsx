"use client";

import Image from "next/image";
import "./globals.css";

// Replaces the root layout when it crashes, so it owns <html> and <body> and can't
// lean on the theme provider, fonts or any shared component that might be the cause.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-sidebar text-sidebar-foreground">
        <main className="flex min-h-svh flex-col items-center justify-center px-6 py-16 text-center">
          <Image src="/logo-icon.png" alt="" width={96} height={98} priority className="error-globe-crashed h-auto w-24" />
          <span className="mt-6 inline-flex h-6 items-center rounded-full bg-primary px-2.5 text-[0.78rem] font-semibold text-primary-foreground">
            Whoa
          </span>
          <h1 className="mt-3 max-w-md text-3xl leading-tight font-extrabold sm:text-4xl">Well, that&apos;s a global problem</h1>
          <p className="mt-2 max-w-sm text-base opacity-85">The whole page crashed. A refresh usually fixes it.</p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="mt-6 h-11 rounded-xl border-[1.5px] border-primary bg-primary px-5 text-[0.9375rem] font-semibold text-primary-foreground"
          >
            Refresh
          </button>
          {error.digest && <p className="mt-6 text-xs opacity-70">Error ID: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
