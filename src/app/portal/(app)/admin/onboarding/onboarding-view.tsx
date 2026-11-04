"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { addOnboardingJcs } from "@/actions/jc-onboarding";
import type { OnboardingData } from "@/lib/data/onboarding";
import type { OnboardingThresholds } from "@/lib/onboarding-attendance";
import { PageHeader } from "@/components/page-header";
import { UrlTabs } from "@/components/url-tabs";
import { Button } from "@/components/ui/button";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RosterTab } from "./roster-tab";
import { SessionsTab } from "./sessions-tab";

function AddJcsDialog({ quarterId }: { quarterId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addOnboardingJcs(quarterId, text);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const parts = [`Added ${result.added} JC${result.added === 1 ? "" : "s"}`];
      if (result.skipped) parts.push(`${result.skipped} already on the roster`);
      toast.success(`${parts.join(", ")}.`);
      if (result.problems?.length) toast.error(result.problems.slice(0, 3).join(" "));
      setText("");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <UserPlus />
            Add JCs
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add JCs</DialogTitle>
          <DialogDescription>
            One per line: a name, or a name and email. Any email works, since JCs don&apos;t have a chapter address.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="JCs, one per line"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Maya Chen, maya@gmail.com\nSam Lee"}
          disabled={pending}
        />
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !text.trim()}>
            Add to roster
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OnboardingView({
  quarterId,
  quarterName,
  quarterStart,
  quarterEnd,
  today,
  data,
  thresholds,
}: {
  quarterId: string;
  quarterName: string;
  quarterStart: string;
  quarterEnd: string;
  today: string;
  data: OnboardingData;
  thresholds: OnboardingThresholds;
}) {
  const activeCount = useMemo(() => data.jcs.filter((j) => !j.removedAt).length, [data.jcs]);
  const takenCount = data.meetings.filter((m) => m.taken).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding"
        description={`${quarterName} · attendance for Junior Consultant onboarding meetings. Any exec can take it.`}
        actions={<AddJcsDialog quarterId={quarterId} />}
      />
      <UrlTabs values={["sessions", "roster"]} fallback="sessions">
        <TabsList>
          <TabsTrigger value="sessions">Meetings {data.meetings.length}</TabsTrigger>
          <TabsTrigger value="roster">Roster {activeCount}</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions" className="pt-4">
          <SessionsTab
            quarterId={quarterId}
            quarterStart={quarterStart}
            quarterEnd={quarterEnd}
            today={today}
            data={data}
            takenCount={takenCount}
          />
        </TabsContent>
        <TabsContent value="roster" className="pt-4">
          <RosterTab data={data} thresholds={thresholds} />
        </TabsContent>
      </UrlTabs>
    </div>
  );
}
