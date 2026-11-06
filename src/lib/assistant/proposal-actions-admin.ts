import { z } from "zod";
import type { ProposalAction } from "./proposal-actions";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1).max(64);
const label = z.string().trim().min(1).max(200);
const text = (max: number) => z.string().trim().max(max);
const USER_ROLES = [
  "junior_consultant", "consultant", "senior_consultant", "project_manager", "director_of_projects",
  "director_of_internal_affairs", "director_of_external_affairs", "director_of_marketing", "director_of_training", "president",
] as const;
const kind = z.enum(["coffee_chat", "interview", "client_meeting"]);
const KIND_LABEL = { coffee_chat: "coffee chat", interview: "interview", client_meeting: "client meeting" } as const;
const notRegistered = (name: string) => async () => {
  throw new Error(`${name} executor not registered`);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Def<A> = { schema: z.ZodType<A, any>; preview: (a: A) => string; requiresExec?: boolean; warning?: string };
/** Compact definition helper: the executor is wired later in tools/write-tools-admin.ts. */
function def<A>(name: string, d: Def<A>): ProposalAction<A> {
  return { requiresExec: d.requiresExec ?? true, warning: d.warning, schema: d.schema, preview: d.preview, execute: notRegistered(name) };
}

export const adminSchemas = {
  deleteTask: z.object({ taskId: id, projectId: id, taskName: label, projectName: label }),
  createProject: z.object({
    clientName: label,
    quarterId: id,
    quarterName: label,
    pmId: id.nullable().optional(),
    pmName: label.nullable().optional(),
    scId: id.nullable().optional(),
    scName: label.nullable().optional(),
    deadline: date.nullable().optional(),
    memberIds: z.array(id).max(30).default([]),
  }),
  deleteProject: z.object({ projectId: id, projectName: label }),
  projectHealth: z.object({ projectId: id, projectName: label, health: z.enum(["on_track", "at_risk", "blocked"]).nullable() }),
  attendance: z.object({
    projectId: id,
    projectName: label,
    date,
    excusedIds: z.array(id).max(60).default([]),
    unexcusedIds: z.array(id).max(60).default([]),
    tardyIds: z.array(id).max(60).default([]),
    summary: text(400),
  }),
  updateEvent: z.object({
    eventId: id,
    title: label,
    date,
    time: text(40).nullable().optional(),
    location: text(200).nullable().optional(),
    description: text(1000).nullable().optional(),
    was: text(200),
  }),
  deleteEvent: z.object({ eventId: id, title: label, date }),
  updateQuickLink: z.object({
    linkId: id,
    title: text(120).min(1),
    url: z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Must be http(s)."),
    description: text(300).nullable().optional(),
    category: text(60).nullable().optional(),
    was: text(200),
  }),
  deleteQuickLink: z.object({ linkId: id, title: label }),
  createWikiPage: z.object({
    section: z.enum(["consultant", "pm"]),
    parentId: id.nullable().optional(),
    title: text(120).min(1),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(100),
    body: text(20000),
  }),
  updateWikiPage: z.object({
    pageId: id,
    title: text(120).min(1),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(100),
    parentId: id.nullable(),
    body: text(20000),
    summary: text(200),
  }),
  deleteWikiPage: z.object({ pageId: id, title: label }),
  createMember: z.object({ name: label, email: z.string().trim().email().max(200) }),
  memberRole: z.object({ userId: id, userName: label, role: z.enum(USER_ROLES), roleLabel: label }),
  memberRef: z.object({ userId: id, userName: label }),
  archiveMember: z.object({
    userId: id,
    userName: label,
    reason: z.enum(["graduated", "left"]),
    currentTitle: text(120).optional(),
    currentCompany: text(120).optional(),
  }),
  addApplicant: z.object({
    quarterId: id,
    name: label,
    email: text(200).optional(),
    major: text(100).optional(),
    year: text(20).optional(),
  }),
  awardPoints: z.object({
    applicantId: id,
    applicantName: label,
    categoryId: id,
    categoryName: label,
    eventId: id.nullable().optional(),
    eventName: label.nullable().optional(),
    points: z.number().int().min(-100).max(100),
    reason: text(200).optional(),
  }),
  voidPoints: z.object({ entryId: id, label: text(200).min(1), reason: text(200).min(1) }),
  createRecruitEvent: z.object({ quarterId: id, categoryId: id, categoryName: label, name: label, date }),
  createQuarter: z.object({ name: label, startDate: date, endDate: date, makeActive: z.boolean().default(false) }),
  quarterRef: z.object({ quarterId: id, name: label }),
  createClient: z.object({
    name: label,
    contactName: text(120).nullable().optional(),
    contactEmail: text(200).nullable().optional(),
    notes: text(1000).nullable().optional(),
  }),
  mergeClients: z.object({ keepId: id, keepName: label, duplicateId: id, duplicateName: label }),
  slotKind: z.object({ kind }),
  bookingOpen: z.object({ kind: z.enum(["coffee_chat", "interview", "client_meeting"]), open: z.boolean() }),
  cancelBooking: z.object({ kind, bookingId: id, label: text(200).min(1) }),
  createPlan: z.object({ quarterId: id, name: label }),
  planRef: z.object({ planId: id, name: label }),
  threshold: z.object({ percent: z.number().int().min(0).max(100) }),
};

const S = adminSchemas;
const human = (s: string) => s.replace(/_/g, " ");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ADMIN_ACTIONS: Record<string, ProposalAction<any>> = {
  delete_task: def("delete_task", {
    schema: S.deleteTask,
    requiresExec: false,
    preview: (a) => `Delete task "${a.taskName}" from ${a.projectName}`,
    warning: "The task is permanently removed.",
  }),
  create_project: def("create_project", {
    schema: S.createProject,
    preview: (a) =>
      `Create project "${a.clientName}" in ${a.quarterName}${a.pmName ? `, PM ${a.pmName}` : ""}${a.scName ? `, SC ${a.scName}` : ""}${a.deadline ? `, due ${a.deadline}` : ""}`,
  }),
  delete_project: def("delete_project", {
    schema: S.deleteProject,
    preview: (a) => `Delete project "${a.projectName}"`,
    warning: "This permanently deletes the project along with its tasks, team memberships and attendance. It cannot be undone.",
  }),
  set_project_health: def("set_project_health", {
    schema: S.projectHealth,
    requiresExec: false,
    preview: (a) => (a.health ? `Set ${a.projectName} health to ${human(a.health)}` : `Clear the health override on ${a.projectName}`),
  }),
  submit_attendance: def("submit_attendance", {
    schema: S.attendance,
    requiresExec: false,
    preview: (a) => `Log attendance for ${a.projectName} on ${a.date}: ${a.summary}`,
  }),
  update_event: def("update_event", {
    schema: S.updateEvent,
    preview: (a) => `Update calendar event "${a.was}" → "${a.title}" on ${a.date}${a.time ? ` at ${a.time}` : ""}${a.location ? ` (${a.location})` : ""}`,
  }),
  delete_event: def("delete_event", {
    schema: S.deleteEvent,
    preview: (a) => `Delete calendar event "${a.title}" (${a.date})`,
    warning: "The event is removed for everyone.",
  }),
  update_quick_link: def("update_quick_link", { schema: S.updateQuickLink, preview: (a) => `Update quick link "${a.was}" → "${a.title}" (${a.url})` }),
  delete_quick_link: def("delete_quick_link", {
    schema: S.deleteQuickLink,
    preview: (a) => `Delete quick link "${a.title}"`,
    warning: "The link is removed for everyone.",
  }),
  create_wiki_page: def("create_wiki_page", {
    schema: S.createWikiPage,
    preview: (a) => `Add Resources page "${a.title}" (${a.section} section, ${a.body.length} characters)`,
  }),
  update_wiki_page: def("update_wiki_page", { schema: S.updateWikiPage, preview: (a) => `Edit Resources page "${a.title}": ${a.summary}` }),
  delete_wiki_page: def("delete_wiki_page", {
    schema: S.deleteWikiPage,
    preview: (a) => `Delete Resources page "${a.title}"`,
    warning: "The page and its content are permanently removed for everyone.",
  }),
  create_member: def("create_member", {
    schema: S.createMember,
    preview: (a) => `Create account for ${a.name} (${a.email}) with the default password`,
  }),
  update_member_role: def("update_member_role", {
    schema: S.memberRole,
    preview: (a) => `Change ${a.userName}'s role to ${a.roleLabel}`,
    warning: "Their access across the portal changes immediately.",
  }),
  reset_member_password: def("reset_member_password", {
    schema: S.memberRef,
    preview: (a) => `Reset ${a.userName}'s password to the default`,
    warning: "They will be signed out of their current password and must use the default one.",
  }),
  archive_member: def("archive_member", {
    schema: S.archiveMember,
    preview: (a) => `Archive ${a.userName} (${a.reason})`,
    warning: "They lose portal access and move to Alumni. You can restore them later.",
  }),
  restore_member: def("restore_member", { schema: S.memberRef, preview: (a) => `Restore ${a.userName} from Alumni` }),
  add_applicant: def("add_applicant", {
    schema: S.addApplicant,
    preview: (a) => `Add applicant ${a.name}${a.major ? ` (${a.major}${a.year ? `, year ${a.year}` : ""})` : ""}`,
  }),
  award_points: def("award_points", {
    schema: S.awardPoints,
    preview: (a) => `Give ${a.applicantName} ${a.points} point${Math.abs(a.points) === 1 ? "" : "s"} for ${a.categoryName}${a.eventName ? ` @ ${a.eventName}` : ""}`,
  }),
  void_points: def("void_points", {
    schema: S.voidPoints,
    preview: (a) => `Void points entry: ${a.label}`,
    warning: "The points stop counting toward the applicant's total.",
  }),
  create_recruit_event: def("create_recruit_event", {
    schema: S.createRecruitEvent,
    preview: (a) => `Add recruitment event "${a.name}" on ${a.date} (${a.categoryName})`,
  }),
  create_quarter: def("create_quarter", {
    schema: S.createQuarter,
    preview: (a) => `Create quarter "${a.name}" (${a.startDate} → ${a.endDate})${a.makeActive ? " and make it active" : ""}`,
    warning: undefined,
  }),
  set_active_quarter: def("set_active_quarter", {
    schema: S.quarterRef,
    preview: (a) => `Make "${a.name}" the active quarter`,
    warning: "Everyone's projects, attendance and tasks switch to this quarter right away.",
  }),
  delete_quarter: def("delete_quarter", {
    schema: S.quarterRef,
    preview: (a) => `Delete quarter "${a.name}"`,
    warning: "This permanently deletes the quarter and everything in it: projects, tasks, attendance and recruitment data.",
  }),
  create_client: def("create_client", { schema: S.createClient, preview: (a) => `Add client "${a.name}"` }),
  merge_clients: def("merge_clients", {
    schema: S.mergeClients,
    preview: (a) => `Merge client "${a.duplicateName}" into "${a.keepName}"`,
    warning: "The duplicate record is removed and its projects move to the one you keep.",
  }),
  generate_slots: def("generate_slots", { schema: S.slotKind, preview: (a) => `Generate ${KIND_LABEL[a.kind]} slots from the saved availability` }),
  publish_all_slots: def("publish_all_slots", {
    schema: S.slotKind,
    preview: (a) => `Publish all ${KIND_LABEL[a.kind]} slots so they can be booked`,
    warning: "Applicants or clients will immediately be able to book them.",
  }),
  set_booking_open: def("set_booking_open", {
    schema: S.bookingOpen,
    preview: (a) => `${a.open ? "Open" : "Close"} ${KIND_LABEL[a.kind]} booking`,
    warning: undefined,
  }),
  cancel_booking: def("cancel_booking", {
    schema: S.cancelBooking,
    preview: (a) => `Cancel ${KIND_LABEL[a.kind]}: ${a.label}`,
    warning: "The booking is cancelled and the other party is notified.",
  }),
  create_team_plan: def("create_team_plan", { schema: S.createPlan, preview: (a) => `Create Team Builder draft "${a.name}"` }),
  finalize_team_plan: def("finalize_team_plan", {
    schema: S.planRef,
    preview: (a) => `Finalize team plan "${a.name}"`,
    warning: "A finalized plan is locked from further edits until it is unfinalized.",
  }),
  apply_team_plan: def("apply_team_plan", {
    schema: S.planRef,
    preview: (a) => `Apply team plan "${a.name}" to this quarter's real teams`,
    warning: "Project teams and memberships are rewritten to match the plan for every member.",
  }),
  approve_team_submissions: def("approve_team_submissions", {
    schema: z.object({}),
    preview: () => "Approve all pending Team page submissions",
    warning: "They go live on the public Team page.",
  }),
  set_attendance_threshold: def("set_attendance_threshold", {
    schema: S.threshold,
    preview: (a) => `Flag members below ${a.percent}% attendance`,
  }),
};
