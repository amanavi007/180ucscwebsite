import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function HowItWorks() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
        <CircleHelp />
        How this works
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-sm">
        <p className="font-medium">Applicant points, in 30 seconds</p>
        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
          <li>Every applicant has a running total built from point entries (info sessions, coffee chats, and so on).</li>
          <li>Click an applicant to see their history, give points, or void a mistake. Nothing is ever deleted.</li>
          <li>Add applicants by hand with <b>Add applicant</b>. If a name looks like someone already here, you&apos;ll be warned.</li>
          <li><b>Setup</b> is where you add or change point categories and events. <b>Duplicates</b> lists people who may be entered twice.</li>
          <li>Points are per quarter. Use the quarter picker at the top to look at a past cycle.</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
