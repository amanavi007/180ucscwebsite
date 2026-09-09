import type { Metadata } from "next";
import { Geist, Geist_Mono, Big_Shoulders } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { NavLoadingProvider, InitialLoadCurtain } from "@/components/nav-loading";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bigShoulders = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  axes: ["opsz"],
});

const SITE_TITLE = "180 Degrees Consulting at UC Santa Cruz";
const SITE_DESCRIPTION =
  "180 Degrees Consulting at UC Santa Cruz is a student-run pro-bono consultancy connecting nonprofits and social enterprises with strategy, research, and growth support.";

export const metadata: Metadata = {
  metadataBase: new URL("https://180ucsc.vercel.app"),
  title: {
    default: SITE_TITLE,
    template: "%s · 180 Degrees Consulting at UCSC",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: SITE_TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bigShoulders.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          <NavLoadingProvider>{children}</NavLoadingProvider>
          <InitialLoadCurtain />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
