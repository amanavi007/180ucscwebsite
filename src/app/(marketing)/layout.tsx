import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { getOptionalProfile } from "@/lib/data/profile";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const profile = await getOptionalProfile();

  return (
    <div className="marketing-light bg-background text-foreground flex min-h-svh flex-col">
      <MarketingNav user={profile ? { name: profile.name } : null} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
