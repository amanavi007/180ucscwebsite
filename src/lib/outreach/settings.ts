import { z } from "zod";
import { parseSenders, type OutreachSender } from "./senders";

export type OutreachMode = "off" | "dry_run" | "self_only" | "exec_only" | "live";

export interface OutreachSettings {
  mode: OutreachMode;
  paused: boolean;
  /** Inbox that "self_only" test sends go to: whoever last switched that mode on. */
  testRecipient: string | null;
  dailyCapOverride: number | null;
  /** "YYYY-MM-DD" (Pacific) of the first day outreach left `off`; the ramp counts from here. */
  startedOn: string | null;
  windowStartHour: number;
  windowEndHour: number;
  senderName: string;
  /** Display name emails come from, e.g. "Aman Avinash". Empty means the team address in the environment. */
  fromName: string;
  /**
   * Everything after the body, from the closing line down, e.g. "Best regards,\n\nAman Avinash\nDirector of Projects".
   * A line may hold links written [label](https://...). Empty means "Best, The 180 Degrees Consulting UCSC team".
   */
  signature: string;
  /** Officers emails come from, one per company. Empty means the single sender above is used for everything. */
  senders: OutreachSender[];
  /** Whether the daily job finds new companies on its own. */
  discoveryEnabled: boolean;
  /** New prospects wanted per day. */
  discoveryPerDay: number;
  /** City names; a company matches when any appears in its locations. */
  discoveryRegions: string[];
  /** YC industry labels, e.g. "Healthcare". */
  discoveryIndustries: string[];
  discoveryMaxTeam: number;
  postalAddress: string;
  /** Business days after the first send for each follow-up, ascending. */
  followupDays: number[];
  /** Master switch for the external research agent's API. */
  agentEnabled: boolean;
  /** Net-new prospects the agent should supply per run day. */
  agentDailyTarget: number;
  /** Who the agent should look for, by segment. */
  agentTargets: AgentTarget[];
}

export const AGENT_SEGMENTS = ["nonprofit", "startup", "small_business", "other"] as const;
export type AgentSegment = (typeof AGENT_SEGMENTS)[number];

export const agentTargetSchema = z.object({
  segment: z.enum(AGENT_SEGMENTS),
  niche: z.enum(["med-tech", "tech", "strategy", "other"]),
  regions: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
  minSize: z.number().int().min(0).max(100_000),
  maxSize: z.number().int().min(1).max(100_000),
  /** Share of the daily target, as a percentage; approximate over a week. */
  share: z.number().min(0).max(100),
  needs: z.string().trim().min(1).max(600),
});
export const agentTargetsSchema = z.array(agentTargetSchema).min(1).max(10);
export type AgentTarget = z.infer<typeof agentTargetSchema>;

export const DEFAULT_AGENT_TARGETS: AgentTarget[] = [
  {
    segment: "nonprofit",
    niche: "strategy",
    regions: ["Santa Cruz", "Monterey", "San Francisco", "Oakland", "San Jose", "Berkeley"],
    minSize: 5,
    maxSize: 200,
    share: 40,
    needs: "program growth, fundraising strategy, community outreach, operations, impact measurement",
  },
  {
    segment: "startup",
    niche: "tech",
    regions: ["San Francisco", "Palo Alto", "Mountain View", "San Jose", "Berkeley", "Oakland", "Menlo Park", "Redwood City", "Sunnyvale", "Santa Cruz"],
    minSize: 5,
    maxSize: 50,
    share: 40,
    needs: "product and go-to-market strategy, user/market research, data and technical projects — the chapter has many technically strong consultants",
  },
  {
    segment: "small_business",
    niche: "other",
    regions: ["Santa Cruz", "San Francisco", "Oakland", "Berkeley", "San Jose"],
    minSize: 5,
    maxSize: 200,
    share: 20,
    needs: "growth strategy, marketing, operations",
  },
];

/** The targets saved as JSON, or the defaults when nothing valid is saved. */
export function parseAgentTargets(raw: string | undefined): AgentTarget[] {
  if (!raw?.trim()) return DEFAULT_AGENT_TARGETS;
  try {
    const parsed = agentTargetsSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.every((t) => t.maxSize >= t.minSize) ? parsed.data : DEFAULT_AGENT_TARGETS;
  } catch {
    return DEFAULT_AGENT_TARGETS;
  }
}

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  mode: "off",
  paused: false,
  testRecipient: null,
  dailyCapOverride: null,
  startedOn: null,
  windowStartHour: 9,
  windowEndHour: 16,
  senderName: "180 Degrees Consulting at UCSC",
  fromName: "",
  signature: "",
  senders: [],
  discoveryEnabled: false,
  discoveryPerDay: 10,
  discoveryRegions: ["San Francisco", "Palo Alto", "Mountain View", "Oakland", "San Jose", "Berkeley", "Menlo Park", "Redwood City", "Sunnyvale", "Santa Cruz"],
  discoveryIndustries: ["Healthcare", "B2B", "Engineering, Product and Design", "Infrastructure", "Fintech"],
  discoveryMaxTeam: 50,
  postalAddress: "1156 High St, Santa Cruz, CA 95064",
  followupDays: [4, 9, 15],
  agentEnabled: false,
  agentDailyTarget: 15,
  agentTargets: DEFAULT_AGENT_TARGETS,
};

export const OUTREACH_SETTING_KEYS = [
  "outreach_mode",
  "outreach_paused",
  "outreach_test_recipient",
  "outreach_daily_cap_override",
  "outreach_started_on",
  "outreach_window_start_hour",
  "outreach_window_end_hour",
  "outreach_sender_name",
  "outreach_from_name",
  "outreach_signature",
  "outreach_senders",
  "outreach_discovery_enabled",
  "outreach_discovery_per_day",
  "outreach_discovery_regions",
  "outreach_discovery_industries",
  "outreach_discovery_max_team",
  "outreach_postal_address",
  "outreach_followup_days",
  "outreach_agent_enabled",
  "outreach_agent_daily_target",
  "outreach_agent_targets",
];

const MODES: OutreachMode[] = ["off", "dry_run", "self_only", "exec_only", "live"];

function hour(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
}

function wholeNumber(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function list(value: string | undefined, separator: string): string[] | null {
  const items = (value ?? "").split(separator).map((v) => v.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

function followupDays(value: string | undefined): number[] | null {
  if (!value) return null;
  const days = value.split(",").map((d) => Number(d.trim()));
  const ascending = days.every((d, i) => Number.isInteger(d) && d > 0 && (i === 0 || d > days[i - 1]));
  return days.length > 0 && ascending ? days : null;
}

export function parseOutreachSettings(rows: { key: string; value: string }[]): OutreachSettings {
  const get = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const d = DEFAULT_OUTREACH_SETTINGS;

  const start = hour(get.outreach_window_start_hour);
  const end = hour(get.outreach_window_end_hour);
  const windowOk = start !== null && end !== null && end > start;

  const cap = Number(get.outreach_daily_cap_override);
  const startedOn = /^\d{4}-\d{2}-\d{2}$/.test(get.outreach_started_on ?? "") ? get.outreach_started_on : null;

  return {
    mode: MODES.includes(get.outreach_mode as OutreachMode) ? (get.outreach_mode as OutreachMode) : d.mode,
    paused: get.outreach_paused === "true",
    testRecipient: get.outreach_test_recipient?.trim() || null,
    dailyCapOverride:
      get.outreach_daily_cap_override && Number.isInteger(cap) && cap >= 0 ? cap : d.dailyCapOverride,
    startedOn,
    windowStartHour: windowOk ? start : d.windowStartHour,
    windowEndHour: windowOk ? end : d.windowEndHour,
    senderName: get.outreach_sender_name?.trim() || d.senderName,
    fromName: get.outreach_from_name?.trim() || d.fromName,
    signature: get.outreach_signature?.replace(/\r\n/g, "\n").trim() || d.signature,
    senders: parseSenders(get.outreach_senders),
    discoveryEnabled: get.outreach_discovery_enabled === "true",
    discoveryPerDay: wholeNumber(get.outreach_discovery_per_day, 0, 50) ?? d.discoveryPerDay,
    discoveryRegions: list(get.outreach_discovery_regions, ",") ?? d.discoveryRegions,
    discoveryIndustries: list(get.outreach_discovery_industries, ";") ?? d.discoveryIndustries,
    discoveryMaxTeam: wholeNumber(get.outreach_discovery_max_team, 1, 1000) ?? d.discoveryMaxTeam,
    postalAddress: get.outreach_postal_address?.trim() || d.postalAddress,
    followupDays: followupDays(get.outreach_followup_days) ?? d.followupDays,
    agentEnabled: get.outreach_agent_enabled === "true",
    agentDailyTarget: wholeNumber(get.outreach_agent_daily_target, 0, 100) ?? d.agentDailyTarget,
    agentTargets: parseAgentTargets(get.outreach_agent_targets),
  };
}

/**
 * Switching on after being fully off starts the slow ramp again, so a long break never
 * turns into a full-speed restart from a cold sender.
 */
export function shouldRestartRamp(previous: OutreachMode, next: OutreachMode): boolean {
  return previous === "off" && next === "live";
}

/** Who gets a forwarded prospect reply: just the test recipient while testing, every exec once live. */
export function replyForwardRecipients(settings: OutreachSettings, execEmails: string[]): string[] {
  if (settings.mode !== "live" && settings.testRecipient) return [settings.testRecipient];
  return execEmails;
}

/** "Aman Avinash <aman@consulting...>" from the environment's team address and a display name; the mailbox is the first name. */
export function buildFromAddress(envFrom: string, fromName: string): string {
  if (!fromName.trim()) return envFrom;
  const address = /<([^>]+)>/.exec(envFrom)?.[1] ?? envFrom;
  const [envLocal, domain] = address.trim().split("@");
  const local = fromName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "") || envLocal;
  const name = fromName.replace(/["<>]/g, "").replace(/\s+/g, " ").trim();
  return `${name} <${local}@${domain}>`;
}
