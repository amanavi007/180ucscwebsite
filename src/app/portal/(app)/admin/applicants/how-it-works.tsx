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
        <p className="font-medium">How recruiting works here</p>
        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
          <li>Every applicant has a running points total from info sessions, coffee chats and more. Click a row to see their history, give points, or void a mistake. Nothing is ever deleted.</li>
          <li><b>Add applicants</b> imports the application spreadsheet, adds one person, or imports an attendance list.</li>
          <li><b>Reviews</b> is where you score the applicants assigned to you. Scores stay hidden until everyone assigned to an applicant has submitted. <b>Progress</b> shows how the whole team is doing.</li>
          <li><b>Attendance</b> is where you mark who came to coffee chats and interviews.</li>
          <li><b>Settings</b> holds point categories, events, reviewers and the scoring rubric. Possible duplicates show up under &ldquo;Needs you&rdquo; on the Applicants tab.</li>
          <li>Everything is per quarter. Use the quarter picker at the top to look at a past cycle.</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
