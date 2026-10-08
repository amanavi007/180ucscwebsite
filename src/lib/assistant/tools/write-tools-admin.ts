import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { deleteOrgEvent, updateOrgEvent } from "@/actions/calendar";
import { approveAll } from "@/actions/team-profiles";
import { setHealthOverride, createProject, deleteProject } from "@/actions/projects";
import { submitAttendance } from "@/actions/attendance";
import { deleteQuickLink, updateQuickLink } from "@/actions/quick-links";
import { createWikiPage, deleteWikiPage, updateWikiPage } from "@/actions/wiki";
import { archiveMember, bulkCreateMembers, resetMemberPassword, restoreMember, updateMemberRole } from "@/actions/members";
import { addApplicantAction, awardPointsAction, createEventAction, voidPointsAction } from "@/actions/recruit";
import { createQuarter, deleteQuarter, setActiveQuarter } from "@/actions/quarters";
import { createClientRecord, mergeClients } from "@/actions/clients";
import { applyPlan, createPlan, finalizePlan } from "@/actions/team-builder";
import { updateAttendanceAlertThreshold } from "@/actions/org-settings";
import { deleteTask } from "@/actions/tasks";
import { cancelBookingAsAdminAction, generateSlotsAction, publishAllSlotsAction } from "@/actions/coffee-chat";
import {
  cancelInterviewBookingAsAdminAction,
  generateInterviewSlotsAction,
  publishAllInterviewSlotsAction,
  setInterviewBookingOpenAction,
} from "@/actions/interview";
import {
  cancelClientMeetingAsAdminAction,
  generateClientMeetingSlotsAction,
  publishAllClientMeetingSlotsAction,
  setClientMeetingBookingOpenAction,
} from "@/actions/client-meeting";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getOrgTodayDateString } from "@/lib/date";
import { UserFacingError, PROPOSAL_ACTIONS, type Actor } from "../proposals";
import { findPerson, findProject, type Lookup } from "./lookup";
import { resolveByName } from "./resolve";
import type { ToolDeps } from "./types";

type Proposer = (name: string, args: unknown) => Promise<unknown>;

function check(result: { error?: string } | void) {
  if (result && result.error) throw new UserFacingError(result.error);
}

const KIND = z.enum(["coffee_chat", "interview", "client_meeting"]);
const ISO = "YYYY-MM-DD";
const refused = (reason: string) => ({ status: "refused" as const, reason });
const slugify = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "page";

const SLOT_ACTIONS = {
  coffee_chat: { generate: generateSlotsAction, publish: publishAllSlotsAction, cancel: cancelBookingAsAdminAction },
  interview: { generate: generateInterviewSlotsAction, publish: publishAllInterviewSlotsAction, cancel: cancelInterviewBookingAsAdminAction },
  client_meeting: { generate: generateClientMeetingSlotsAction, publish: publishAllClientMeetingSlotsAction, cancel: cancelClientMeetingAsAdminAction },
} as const;

/** Wires the heavier actions. Mirrors registerExecutors in write-tools.ts and runs inside it. */
export function registerAdminExecutors() {
  const A = PROPOSAL_ACTIONS;
  A.delete_task.execute = async (a) => check(await deleteTask(a.taskId, a.projectId));
  A.create_project.execute = async (a) =>
    check(
      await createProject({
        clientName: a.clientName,
        quarterId: a.quarterId,
        projectManagerId: a.pmId ?? null,
        seniorConsultantId: a.scId ?? null,
        deadline: a.deadline ?? null,
        memberIds: a.memberIds,
      }),
    );
  A.delete_project.execute = async (a) => check(await deleteProject(a.projectId));
  A.set_project_health.execute = async (a) => check(await setHealthOverride(a.projectId, a.health));
  A.submit_attendance.execute = async (a) =>
    check(
      await submitAttendance({
        projectId: a.projectId,
        date: a.date,
        excusedIds: a.excusedIds,
        unexcusedIds: a.unexcusedIds,
        tardyIds: a.tardyIds,
      }),
    );
  A.update_event.execute = async (a) =>
    check(await updateOrgEvent(a.eventId, { title: a.title, date: a.date, time: a.time, location: a.location, description: a.description }));
  A.delete_event.execute = async (a) => check(await deleteOrgEvent(a.eventId));
  A.update_quick_link.execute = async (a) =>
    check(await updateQuickLink(a.linkId, { title: a.title, url: a.url, description: a.description ?? "", category: a.category ?? "" }));
  A.delete_quick_link.execute = async (a) => check(await deleteQuickLink(a.linkId));
  A.create_wiki_page.execute = async (a) =>
    check(await createWikiPage({ section: a.section, parentId: a.parentId ?? null, title: a.title, slug: a.slug, body: a.body }));
  A.update_wiki_page.execute = async (a) =>
    check(await updateWikiPage(a.pageId, { title: a.title, slug: a.slug, parentId: a.parentId, body: a.body }));
  A.delete_wiki_page.execute = async (a) => check(await deleteWikiPage(a.pageId));
  A.create_member.execute = async (a) => {
    const r = await bulkCreateMembers([{ name: a.name, email: a.email }]);
    check(r);
    const row = r.results?.[0];
    if (row?.status === "error") throw new UserFacingError(row.message ?? "Couldn't create that account.");
  };
  A.update_member_role.execute = async (a) => check(await updateMemberRole(a.userId, a.role));
  A.reset_member_password.execute = async (a) => check(await resetMemberPassword(a.userId));
  A.archive_member.execute = async (a) =>
    check(await archiveMember(a.userId, { reason: a.reason, currentTitle: a.currentTitle, currentCompany: a.currentCompany }));
  A.restore_member.execute = async (a) => check(await restoreMember(a.userId));
  A.add_applicant.execute = async (a) =>
    check(await addApplicantAction({ quarterId: a.quarterId, name: a.name, email: a.email, major: a.major, year: a.year }));
  A.award_points.execute = async (a) =>
    check(
      await awardPointsAction({
        applicantId: a.applicantId,
        categoryId: a.categoryId,
        eventId: a.eventId ?? null,
        points: a.points,
        reason: a.reason,
      }),
    );
  A.void_points.execute = async (a) => check(await voidPointsAction(a.entryId, a.reason));
  A.create_recruit_event.execute = async (a) =>
    check(await createEventAction({ quarterId: a.quarterId, categoryId: a.categoryId, name: a.name, date: a.date }));
  A.create_quarter.execute = async (a) =>
    check(await createQuarter({ name: a.name, startDate: a.startDate, endDate: a.endDate, makeActive: a.makeActive }));
  A.set_active_quarter.execute = async (a) => check(await setActiveQuarter(a.quarterId));
  A.delete_quarter.execute = async (a) => check(await deleteQuarter(a.quarterId));
  A.create_client.execute = async (a) =>
    check(await createClientRecord({ name: a.name, contactName: a.contactName ?? null, contactEmail: a.contactEmail ?? null, notes: a.notes ?? null }));
  A.merge_clients.execute = async (a) => check(await mergeClients(a.keepId, a.duplicateId));
  A.generate_slots.execute = async (a) => check(await SLOT_ACTIONS[a.kind as keyof typeof SLOT_ACTIONS].generate());
  A.publish_all_slots.execute = async (a) => check(await SLOT_ACTIONS[a.kind as keyof typeof SLOT_ACTIONS].publish());
  A.set_booking_open.execute = async (a) =>
    check(a.kind === "interview" ? await setInterviewBookingOpenAction(a.open) : await setClientMeetingBookingOpenAction(a.open));
  A.cancel_booking.execute = async (a) => check(await SLOT_ACTIONS[a.kind as keyof typeof SLOT_ACTIONS].cancel(a.bookingId));
  A.create_team_plan.execute = async (a) => check(await createPlan(a.quarterId, a.name));
  A.finalize_team_plan.execute = async (a) => check(await finalizePlan(a.planId));
  A.apply_team_plan.execute = async (a) => check(await applyPlan(a.planId));
  A.approve_team_submissions.execute = async () => check(await approveAll());
  A.set_attendance_threshold.execute = async (a) => check(await updateAttendanceAlertThreshold(a.percent));
}

async function withLookup<T>(l: Lookup<T>, then: (item: T) => Promise<unknown>) {
  return l.ok ? then(l.item) : refused(l.reason);
}

function pick<T>(query: string, items: T[], nameOf: (t: T) => string, what: string): Lookup<T> {
  const r = resolveByName(query, items, nameOf);
  if (r.kind === "one") return { ok: true, item: r.item };
  if (r.kind === "none") return { ok: false, reason: `No ${what} matches "${query}".` };
  return { ok: false, reason: `More than one ${what} matches "${query}": ${r.items.slice(0, 6).map(nameOf).join("; ")}. Ask which.` };
}

export function buildAdminWriteTools(_actor: Actor, deps: ToolDeps, propose: Proposer, note: string): ToolSet {
  const { data } = deps;
  const quarter = async () => data.activeQuarter();
  const NO_Q = refused("There is no active quarter yet.");

  return {
    propose_task_delete: tool({
      description: `Propose deleting a task.${note}`,
      inputSchema: z.object({ task: z.string(), project: z.string().optional() }),
      execute: async ({ task, project }) => {
        const q = await quarter();
        if (!q) return NO_Q;
        let projectId: string | undefined;
        if (project) {
          const p = await findProject(deps, project);
          if (!p.ok) return refused(p.reason);
          projectId = p.item.id;
        }
        const rows = await data.tasks(q.id, { projectId });
        return withLookup(pick(task, rows, (t) => `${t.task_name} (${t.project ?? "no project"})`, "task"), (t) =>
          propose("delete_task", { taskId: t.id, projectId: t.project_id, taskName: t.task_name, projectName: t.project ?? "project" }),
        );
      },
    }),
    propose_project_create: tool({
      description: `Propose creating a project in the active quarter. Exec only.${note}`,
      inputSchema: z.object({
        client: z.string().describe("Client name"),
        pm: z.string().optional().describe("PM's name"),
        sc: z.string().optional().describe("Senior consultant's name"),
        deadline: z.string().optional().describe(ISO),
        members: z.array(z.string()).optional(),
      }),
      execute: async (a) => {
        const q = await quarter();
        if (!q) return NO_Q;
        const ids: string[] = [];
        const find = async (n: string) => findPerson(deps, n);
        const pm = a.pm ? await find(a.pm) : null;
        if (pm && !pm.ok) return refused(pm.reason);
        const sc = a.sc ? await find(a.sc) : null;
        if (sc && !sc.ok) return refused(sc.reason);
        for (const m of a.members ?? []) {
          const r = await find(m);
          if (!r.ok) return refused(r.reason);
          ids.push(r.item.id);
        }
        return propose("create_project", {
          clientName: a.client, quarterId: q.id, quarterName: q.name,
          pmId: pm?.ok ? pm.item.id : undefined, pmName: pm?.ok ? pm.item.name : undefined,
          scId: sc?.ok ? sc.item.id : undefined, scName: sc?.ok ? sc.item.name : undefined,
          deadline: a.deadline, memberIds: ids,
        });
      },
    }),
    propose_project_delete: tool({
      description: `Propose permanently deleting a project. Exec only.${note}`,
      inputSchema: z.object({ project: z.string() }),
      execute: async ({ project }) =>
        withLookup(await findProject(deps, project), (p) => propose("delete_project", { projectId: p.id, projectName: p.client_name })),
    }),
    propose_project_health: tool({
      description: `Propose overriding a project's health (on_track, at_risk, blocked), or clearing the override with health=null.${note}`,
      inputSchema: z.object({ project: z.string(), health: z.enum(["on_track", "at_risk", "blocked"]).nullable() }),
      execute: async ({ project, health }) =>
        withLookup(await findProject(deps, project), (p) => propose("set_project_health", { projectId: p.id, projectName: p.client_name, health })),
    }),
    propose_attendance: tool({
      description: `Propose logging a team's attendance for a meeting. List only the people who were absent (excused/unexcused) or tardy; everyone else is marked present. PM/SC or exec.${note}`,
      inputSchema: z.object({
        project: z.string(),
        date: z.string().optional().describe(`${ISO}; defaults to today`),
        excused: z.array(z.string()).optional(),
        unexcused: z.array(z.string()).optional(),
        tardy: z.array(z.string()).optional(),
      }),
      execute: async (a) =>
        withLookup(await findProject(deps, a.project), async (p) => {
          const detail = await data.projectDetail(p.id);
          const bucket = async (names: string[] | undefined) => {
            const ids: string[] = [];
            const labels: string[] = [];
            for (const n of names ?? []) {
              const m = pick(n, detail.members, (x) => x.name, "team member");
              if (!m.ok) return { error: m.reason };
              ids.push(m.item.id);
              labels.push(m.item.name);
            }
            return { ids, labels };
          };
          const [ex, un, ta] = [await bucket(a.excused), await bucket(a.unexcused), await bucket(a.tardy)];
          for (const b of [ex, un, ta]) if ("error" in b) return refused(b.error!);
          const parts = [
            ex.labels?.length ? `excused: ${ex.labels.join(", ")}` : "",
            un.labels?.length ? `unexcused: ${un.labels.join(", ")}` : "",
            ta.labels?.length ? `tardy: ${ta.labels.join(", ")}` : "",
          ].filter(Boolean);
          return propose("submit_attendance", {
            projectId: p.id, projectName: p.client_name, date: a.date ?? getOrgTodayDateString(),
            excusedIds: ex.ids, unexcusedIds: un.ids, tardyIds: ta.ids,
            summary: parts.length ? parts.join("; ") : "everyone present",
          });
        }),
    }),
    propose_event_update: tool({
      description: `Propose editing or deleting an org calendar event found by title. Exec only.${note}`,
      inputSchema: z.object({
        event: z.string().describe("Part of the event title"),
        action: z.enum(["update", "delete"]),
        title: z.string().optional(),
        date: z.string().optional().describe(ISO),
        time: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
      execute: async (a) => {
        const items = (await data.calendarItems()).filter((e) => e.kind === "event" && e.canManage);
        return withLookup(pick(a.event, items, (e) => `${e.title} (${e.date})`, "calendar event"), (e) => {
          if (a.action === "delete") return propose("delete_event", { eventId: e.id, title: e.title, date: e.date });
          return propose("update_event", {
            eventId: e.id, title: a.title ?? e.title, date: a.date ?? e.date,
            time: a.time === undefined ? e.time : a.time, location: a.location === undefined ? e.location : a.location,
            description: a.description === undefined ? e.description : a.description, was: e.title,
          });
        });
      },
    }),
    propose_quick_link_update: tool({
      description: `Propose editing or deleting a quick link found by title. Exec only.${note}`,
      inputSchema: z.object({
        link: z.string().describe("Part of the link title"),
        action: z.enum(["update", "delete"]),
        title: z.string().optional(),
        url: z.string().optional(),
        description: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
      }),
      execute: async (a) =>
        withLookup(pick(a.link, await data.quickLinks(), (l) => l.title, "quick link"), (l) =>
          a.action === "delete"
            ? propose("delete_quick_link", { linkId: l.id, title: l.title })
            : propose("update_quick_link", {
                linkId: l.id, title: a.title ?? l.title, url: a.url ?? l.url,
                description: a.description === undefined ? l.description : a.description,
                category: a.category === undefined ? l.category : a.category, was: l.title,
              }),
        ),
    }),
    propose_resource_page: tool({
      description: `Propose adding, editing or deleting a page in the Resources wiki (the consultant guide). Body is markdown. For edit, pass 'append' to add to the end or 'body' to replace the whole text. Exec only.${note}`,
      inputSchema: z.object({
        action: z.enum(["create", "edit", "delete"]),
        title: z.string().describe("Title of the page (to create) or part of the title (to edit/delete)"),
        section: z.enum(["consultant", "pm"]).optional().describe("create only; default consultant"),
        parent: z.string().optional().describe("create only: title of a parent page"),
        body: z.string().optional(),
        append: z.string().optional(),
        new_title: z.string().optional(),
      }),
      execute: async (a) => {
        const pages = await data.wikiPages(true);
        if (a.action === "create") {
          if (!a.body) return refused("A page needs body text.");
          const section = a.section ?? "consultant";
          let parentId: string | null = null;
          if (a.parent) {
            const p = pick(a.parent, pages.filter((x) => x.section === section), (x) => x.title, "parent page");
            if (!p.ok) return refused(p.reason);
            parentId = p.item.id;
          }
          const taken = new Set(pages.filter((p) => p.section === section).map((p) => p.slug));
          let slug = slugify(a.title);
          for (let n = 2; taken.has(slug); n++) slug = `${slugify(a.title)}-${n}`;
          return propose("create_wiki_page", { section, parentId, title: a.title, slug, body: a.body });
        }
        return withLookup(pick(a.title, pages, (p) => p.title, "Resources page"), (p) => {
          if (a.action === "delete") return propose("delete_wiki_page", { pageId: p.id, title: p.title });
          if (!a.body && !a.append && !a.new_title) return Promise.resolve(refused("Say what to change."));
          const body = a.body ?? (a.append ? `${p.body.trimEnd()}\n\n${a.append}` : p.body);
          const summary = a.body ? "replace the text" : a.append ? "add text at the end" : `rename to "${a.new_title}"`;
          return propose("update_wiki_page", {
            pageId: p.id, title: a.new_title ?? p.title, slug: p.slug, parentId: p.parent_id, body, summary,
          });
        });
      },
    }),
    propose_member_create: tool({
      description: `Propose creating a member account (name + email); it gets the default password. Exec only.${note}`,
      inputSchema: z.object({ name: z.string(), email: z.string() }),
      execute: (a) => propose("create_member", a),
    }),
    propose_member_change: tool({
      description: `Propose a change to a member (organization-wide role such as "make Priya a project manager"; no project needed): change role, reset password, archive (graduated/left), or restore an alumnus. Exec only.${note}`,
      inputSchema: z.object({
        person: z.string(),
        action: z.enum(["change_role", "reset_password", "archive", "restore"]),
        role: z.string().optional().describe("change_role: the new role, e.g. 'Project Manager'"),
        reason: z.enum(["graduated", "left"]).optional(),
        title: z.string().optional(),
        company: z.string().optional(),
      }),
      execute: async (a) => {
        if (a.action === "restore") {
          const alumni = await data.alumni();
          return withLookup(pick(a.person, alumni, (x) => x.name, "alumnus"), (u) => propose("restore_member", { userId: u.userId, userName: u.name }));
        }
        return withLookup(await findPerson(deps, a.person), async (u) => {
          if (a.action === "reset_password") return propose("reset_member_password", { userId: u.id, userName: u.name });
          if (a.action === "archive") {
            if (!a.reason) return refused("Ask whether they graduated or left.");
            return propose("archive_member", { userId: u.id, userName: u.name, reason: a.reason, currentTitle: a.title, currentCompany: a.company });
          }
          if (!a.role) return refused("Ask which role.");
          const roles = Object.entries(ROLE_LABELS).map(([key, label]) => ({ key, label }));
          const r = pick(a.role, roles, (x) => x.label, "role");
          if (!r.ok) return refused(r.reason);
          return propose("update_member_role", { userId: u.id, userName: u.name, role: r.item.key, roleLabel: r.item.label });
        });
      },
    }),
    propose_recruitment: tool({
      description: `Propose a recruitment change: add an applicant, award points, void a points entry, or add a recruitment event. Exec only.${note}`,
      inputSchema: z.object({
        action: z.enum(["add_applicant", "award_points", "void_points", "add_event"]),
        applicant: z.string().optional().describe("Applicant name (add_applicant: the new person)"),
        major: z.string().optional(),
        year: z.string().optional(),
        email: z.string().optional(),
        category: z.string().optional().describe("Points category name (award_points, add_event)"),
        event: z.string().optional().describe("Recruitment event name (award_points, optional; add_event: the new event's name)"),
        points: z.number().int().optional().describe("Defaults to the category's default points"),
        reason: z.string().optional(),
        entry: z.string().optional().describe("void_points: part of the entry's category/event"),
        date: z.string().optional().describe(`add_event: ${ISO}`),
      }),
      execute: async (a) => {
        const q = await quarter();
        if (!q) return NO_Q;
        if (a.action === "add_applicant") {
          if (!a.applicant) return refused("Need the applicant's name.");
          return propose("add_applicant", { quarterId: q.id, name: a.applicant, email: a.email, major: a.major, year: a.year });
        }
        const setup = await data.recruitSetup(q.id);
        const cat = a.category ? pick(a.category, setup.categories.filter((c) => !c.archived), (c) => c.name, "points category") : null;
        if (cat && !cat.ok) return refused(cat.reason);
        if (a.action === "add_event") {
          if (!cat?.ok || !a.event || !a.date) return refused("Need a category, event name and date.");
          return propose("create_recruit_event", { quarterId: q.id, categoryId: cat.item.id, categoryName: cat.item.name, name: a.event, date: a.date });
        }
        if (!a.applicant) return refused("Need the applicant's name.");
        const people = await data.applicants(q.id);
        return withLookup(pick(a.applicant, people, (p) => p.name, "applicant"), async (ap) => {
          if (a.action === "void_points") {
            const live = ap.entries.filter((e) => !e.voided);
            const needle = a.entry ?? a.category ?? "";
            const e = pick(needle, live, (x) => `${x.category}${x.event ? ` @ ${x.event}` : ""}`, "points entry");
            if (!e.ok) return refused(e.reason);
            return propose("void_points", {
              entryId: e.item.id,
              label: `${ap.name}: ${e.item.points} for ${e.item.category}${e.item.event ? ` @ ${e.item.event}` : ""}`,
              reason: a.reason ?? "Voided via assistant",
            });
          }
          if (!cat?.ok) return refused("Need which points category.");
          let ev: { id: string; name: string } | null = null;
          if (a.event) {
            const evs = pick(a.event, setup.events, (x) => x.name, "recruitment event");
            if (!evs.ok) return refused(evs.reason);
            ev = evs.item;
          }
          return propose("award_points", {
            applicantId: ap.id, applicantName: ap.name, categoryId: cat.item.id, categoryName: cat.item.name,
            eventId: ev?.id ?? null, eventName: ev?.name ?? null, points: a.points ?? cat.item.defaultPoints, reason: a.reason,
          });
        });
      },
    }),
    propose_quarter: tool({
      description: `Propose a quarter change: create one, make one the active quarter, or delete one. Exec only.${note}`,
      inputSchema: z.object({
        action: z.enum(["create", "activate", "delete"]),
        name: z.string(),
        start: z.string().optional().describe(`create: ${ISO}`),
        end: z.string().optional().describe(`create: ${ISO}`),
        make_active: z.boolean().optional(),
      }),
      execute: async (a) => {
        if (a.action === "create") {
          if (!a.start || !a.end) return refused("Need start and end dates.");
          return propose("create_quarter", { name: a.name, startDate: a.start, endDate: a.end, makeActive: !!a.make_active });
        }
        return withLookup(pick(a.name, await data.quarters(), (x) => x.name, "quarter"), (qt) =>
          propose(a.action === "activate" ? "set_active_quarter" : "delete_quarter", { quarterId: qt.id, name: qt.name }),
        );
      },
    }),
    propose_client: tool({
      description: `Propose adding a client record or merging a duplicate client into another. Exec only.${note}`,
      inputSchema: z.object({
        action: z.enum(["create", "merge"]),
        name: z.string().describe("create: new client name; merge: the client to KEEP"),
        duplicate: z.string().optional().describe("merge: the duplicate to remove"),
        contact_name: z.string().optional(),
        contact_email: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (a) => {
        if (a.action === "create") return propose("create_client", { name: a.name, contactName: a.contact_name, contactEmail: a.contact_email, notes: a.notes });
        if (!a.duplicate) return refused("Need the duplicate client's name.");
        const clients = await data.clients();
        return withLookup(pick(a.name, clients, (c) => c.name, "client to keep"), (keep) =>
          withLookup(pick(a.duplicate!, clients.filter((c) => c.id !== keep.id), (c) => c.name, "duplicate client"), (dup) =>
            propose("merge_clients", { keepId: keep.id, keepName: keep.name, duplicateId: dup.id, duplicateName: dup.name }),
          ),
        );
      },
    }),
    propose_scheduling: tool({
      description: `Propose a scheduling change for coffee chats, interviews or client meetings: generate slots from availability, publish all slots, open/close booking (interview and client_meeting only), or cancel a booking by the person's name. Exec only.${note}`,
      inputSchema: z.object({
        kind: KIND,
        action: z.enum(["generate_slots", "publish_all", "open_booking", "close_booking", "cancel_booking"]),
        who: z.string().optional().describe("cancel_booking: the applicant/contact name"),
      }),
      execute: async (a) => {
        if (a.action === "generate_slots") return propose("generate_slots", { kind: a.kind });
        if (a.action === "publish_all") return propose("publish_all_slots", { kind: a.kind });
        if (a.action === "open_booking" || a.action === "close_booking") {
          if (a.kind === "coffee_chat") return refused("Coffee chat booking can't be opened or closed from here; use Admin.");
          return propose("set_booking_open", { kind: a.kind, open: a.action === "open_booking" });
        }
        if (!a.who) return refused("Need whose booking to cancel.");
        const today = getOrgTodayDateString();
        const rows = (await data.bookings()).filter((b) => b.kind === a.kind && b.status === "confirmed" && b.date >= today);
        return withLookup(pick(a.who, rows, (b) => `${b.who} (${b.date} ${b.start.slice(0, 5)})`, "booking"), (b) =>
          propose("cancel_booking", { kind: a.kind, bookingId: b.id, label: `${b.who} on ${b.date} at ${b.start.slice(0, 5)}` }),
        );
      },
    }),
    propose_team_plan: tool({
      description: `Propose a Team Builder change: create a draft, finalize one, or apply one to the real teams. Exec only.${note}`,
      inputSchema: z.object({ action: z.enum(["create", "finalize", "apply"]), name: z.string() }),
      execute: async (a) => {
        const q = await quarter();
        if (!q) return NO_Q;
        if (a.action === "create") return propose("create_team_plan", { quarterId: q.id, name: a.name });
        return withLookup(pick(a.name, await data.teamPlans(q.id), (p) => p.name, "team plan"), (p) =>
          propose(a.action === "finalize" ? "finalize_team_plan" : "apply_team_plan", { planId: p.id, name: p.name }),
        );
      },
    }),
    propose_admin_setting: tool({
      description: `Propose an org setting change: the attendance alert threshold (percent), or approving all pending Team page submissions. Exec only.${note}`,
      inputSchema: z.object({
        action: z.enum(["attendance_threshold", "approve_team_submissions"]),
        percent: z.number().int().min(0).max(100).optional(),
      }),
      execute: async (a) => {
        if (a.action === "approve_team_submissions") return propose("approve_team_submissions", {});
        if (a.percent === undefined) return refused("Need the percent.");
        return propose("set_attendance_threshold", { percent: a.percent });
      },
    }),
  };
}
