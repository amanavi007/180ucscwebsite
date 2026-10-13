import type { Metadata } from "next";
import { getDirectory } from "@/lib/data/directory";
import { getAlumni } from "@/lib/data/alumni";
import { getApprovedPhotoUrls } from "@/lib/data/team-page";
import { getActiveQuarter } from "@/lib/data/quarters";
import { getCurrentProfile } from "@/lib/data/profile";
import { getQuarterAttendanceRates } from "@/lib/data/attendance";
import { getAttendanceAlertThreshold } from "@/lib/data/org-settings";
import type { AttendanceRateResult } from "@/lib/attendance";
import { isExec } from "@/lib/auth/roles";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/url-tabs";
import { DirectoryView } from "./directory-view";
import { AlumniView } from "./alumni-view";

export const metadata: Metadata = { title: "Directory" };

export default async function DirectoryPage() {
  const [profile, activeQuarter] = await Promise.all([getCurrentProfile(), getActiveQuarter()]);
  const [rows, alumni, photos] = await Promise.all([getDirectory(activeQuarter?.id ?? null), getAlumni(), getApprovedPhotoUrls()]);
  const exec = isExec(profile.role);

  // Attendance rate is Exec-only, per the org's permission model.
  const [rates, attendanceThreshold]: [Record<string, AttendanceRateResult> | undefined, number] =
    exec && activeQuarter
      ? await Promise.all([
          getQuarterAttendanceRates(activeQuarter.id, rows),
          getAttendanceAlertThreshold(exec),
        ])
      : [undefined, 0.8];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl leading-tight">Directory</h1>
        <p className="text-sm text-muted-foreground">
          Every member and their current team{activeQuarter ? ` · ${activeQuarter.name}` : ""}.
        </p>
      </div>

      <UrlTabs values={["roster", "alumni"]} fallback="roster">
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="alumni">Alumni ({alumni.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="roster">
          <DirectoryView rows={rows} rates={rates} attendanceThreshold={attendanceThreshold} photos={photos} />
        </TabsContent>
        <TabsContent value="alumni">
          <AlumniView alumni={alumni} />
        </TabsContent>
      </UrlTabs>
    </div>
  );
}
