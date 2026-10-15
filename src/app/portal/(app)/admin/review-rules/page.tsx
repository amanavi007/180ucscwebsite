import type { Metadata } from "next";
import { getCurrentRubric } from "@/lib/data/prelim-review";
import { PageHeader } from "@/components/page-header";
import { RulesEditor } from "./rules-editor";

export const metadata: Metadata = { title: "Admin · Review rules" };

export default async function ReviewRulesPage() {
  const [doc, slides] = await Promise.all([getCurrentRubric("doc"), getCurrentRubric("slides")]);
  return (
    <div className="space-y-2">
      <PageHeader
        title="Review rules"
        description="What the prelim reviewer checks. Saving makes a new version; past reviews keep the version they used."
      />
      <RulesEditor rubrics={{ doc, slides }} />
    </div>
  );
}
