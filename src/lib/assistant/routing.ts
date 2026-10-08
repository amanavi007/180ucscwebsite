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

const DEFAULT_AREAS: Area[] = ["projects", "tasks", "events", "search", "wiki"];

const AREA_PATTERNS: [Area, RegExp][] = [
  ["recruitment", /\b(applicants?|recruit\w*|points?|coffee chats?|interviews?|info sessions?|candidates?)\b/i],
  ["attendance", /\b(attendance|absent|absences?|tardy|tardies|late|present|no-?shows?|miss(ed|es|ing)?)\b/i],
  ["people", /\b(who|members?|roster|directory|pm|project managers?|consultants?|execs?|president|directors?|alumni|alum)\b/i],
  ["projects", /\b(projects?|clients?|deliverables?|deadlines?|health|team)\b/i],
  ["tasks", /\b(tasks?|to-?dos?|due|overdue|assigned|working on|workload)\b/i],
  ["events", /\b(events?|calendar|meetings?|meeting days?|schedule|upcoming)\b/i],
  ["guide", /\b(what should i (do|work|focus)|next steps?|stuck|where (do|should) i (start|begin)|what'?s next|walk me through|get started)\b/i],
  ["scheduling", /\b(coffee chats?|interviews?|bookings?|booked|client meetings?|slots?)\b/i],
  ["wiki", /\b(wiki|resources?|guides?|handbook|docs?|documentation|policy|policies|template|onboarding|process|procedure|best practices?|how (do|to|can|should))\b/i],
  ["links", /\b(links?|urls?|drive|folder|form)\b/i],
  ["notifications", /\b(notifications?|alerts?|inbox|unread|what('s| did) i miss)\b/i],
  ["admin", /\b(stats?|statistics|activity|audit|log|attention|recent(ly)?|what did .* (change|do|edit)|overdue|completion|rollup|quality|quarters?|clients?|plans?|team builder)\b/i],
  ["actions", /\b(add|create|make|new|remind|schedule|mark|complete|finish|done|reopen|change|update|set|move|assign|reassign|unassign|delete|remove|reschedule|rename|push|put|cancel|archive|restore|give|award|log|record|submit|publish|generate|finalize|finalise|apply|approve|open|close|reset|merge|void)\b/i],
];

/** Keyword routing: no extra model call. Only the matched areas' tools are sent. */
export function selectAreas(text: string): Area[] {
  const matched = AREA_PATTERNS.filter(([, re]) => re.test(text)).map(([area]) => area);
  return matched.length > 0 ? matched : [...DEFAULT_AREAS];
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
