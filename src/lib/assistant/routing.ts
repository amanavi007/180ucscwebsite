export type Area =
  | "projects"
  | "tasks"
  | "events"
  | "recruitment"
  | "attendance"
  | "people"
  | "actions"
  | "wiki"
  | "guide"
  | "knowledge"
  | "scheduling"
  | "links"
  | "notifications"
  | "admin"
  | "search";
/** Shortcut ids are the names of the tool whose result they show. */
export type Shortcut =
  | "my_open_tasks"
  | "upcoming_events"
  | "my_projects"
  | "quarter_projects"
  | "attendance_report"
  | "my_attendance"
  | "top_applicants";

/**
 * Every read tool is always offered. Gating them by keyword hid the right tool whenever the wording was unusual
 * ("pay attention" hid the wiki, "my PM" hid the project tools). Read tools only return data the caller may see,
 * so offering them is safe; the cost is a few hundred more cached prompt tokens.
 */
const READ_AREAS: Area[] = [
  "projects", "tasks", "events", "recruitment", "attendance", "people", "wiki", "guide", "knowledge",
  "scheduling", "links", "notifications", "admin", "search",
];

const ACTION_WORDS = /\b(add|create|make|new|remind|schedule|mark|complete|finish|done|reopen|change|update|set|move|assign|reassign|unassign|delete|remove|reschedule|rename|push|put|cancel|archive|restore|give|award|log|record|submit|publish|generate|finalize|finalise|apply|approve|open|close|reset|merge|void|promote|demote|swap|switch|bump|extend|drop|kick|invite|send)\b/i;
/** A short reply to an assistant that was mid-change ("yes", "the Acme one", "friday") must keep the write tools. */
const SHORT_REPLY = /^.{0,40}$/;

/**
 * Keyword routing now only decides whether write (propose_*) tools are offered. `recentWrite` is true when the
 * previous turns already used a propose_* tool, so a clarifying answer isn't stranded without them.
 */
export function selectAreas(text: string, opts: { recentWrite?: boolean } = {}): Area[] {
  const wantsActions = ACTION_WORDS.test(text) || (!!opts.recentWrite && SHORT_REPLY.test(text.trim()));
  return wantsActions ? [...READ_AREAS, "actions"] : [...READ_AREAS];
}

const SHORTCUTS: [Shortcut, RegExp][] = [
  ["my_open_tasks", /^((what('?s| is| are)?|show|list)\s+)?(my\s+)?(open\s+)?(tasks|to-?dos?|due|due soon)(\s+do i have)?\??$/i],
  ["upcoming_events", /^(what('?s| is)?\s+)?(upcoming events|events (this|next) week|what'?s coming up)\??$/i],
  ["my_projects", /^(show |list |what are )?my projects\??$/i],
  ["quarter_projects", /^(show |list )?(all projects|every project|projects this quarter)\??$/i],
  ["attendance_report", /^((who('s| has| is)?\s+)?(the\s+)?(worst|lowest)\s+attendance(\s+right now)?|attendance report)\??$/i],
  ["my_attendance", /^(what('?s| is)?\s+)?my attendance\??$/i],
  ["top_applicants", /^((who are |show |list )?(the )?top applicants|(recruitment|applicant) (rankings?|leaderboard))\??$/i],
];

/** Exact short intents only, so a real question is never hijacked. */
export function matchShortcut(text: string): Shortcut | null {
  const t = text.trim().replace(/[.!]+$/, "");
  for (const [id, re] of SHORTCUTS) if (re.test(t)) return id;
  return null;
}
