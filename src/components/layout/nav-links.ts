import type { LucideIcon } from "lucide-react";
import {
  Kanban,
  ListTodo,
  Users,
  ClipboardCheck,
  BookOpen,
  ShieldCheck,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  SlidersHorizontal,
  Users2,
  History,
  Link2,
  BarChart3,
  CalendarHeart,
  Camera,
  Handshake,
  ListOrdered,
  House,
  UsersRound,
} from "lucide-react";

export type AdminGroup = "admin-today" | "admin-recruiting" | "admin-scheduling" | "admin-people" | "admin-setup";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  execOnly?: boolean;
  /** Extra terms this page should also match on in search, beyond its label. */
  keywords?: string;
  /** Admin pages whose data depends on `?quarter=`; the breadcrumb bar shows the quarter picker for these. */
  quarterScoped?: boolean;
  /** Sidebar grouping only -- unset means "ungrouped" (rendered on its own). */
  group?: "work" | "people" | "reference" | AdminGroup;
  /** False for pages that are reached from another page or search, not from the sidebar rail. */
  rail?: boolean;
  /** Short name for this page when it is shown as a view inside its place (the pill switch). Defaults to `label`. */
  viewLabel?: string;
  /** One-sentence explanation shown for this page in the first-time sidebar tour. */
  tourDescription?: string;
}

export const NAV_LINKS: NavLink[] = [
  {
    href: "/portal",
    label: "Home",
    icon: House,
    keywords: "assistant ai chat ask help home",
    tourDescription: "Ask anything about your projects, tasks and events, or have the assistant draft changes for you to approve.",
  },
  {
    href: "/portal/projects",
    label: "Projects",
    icon: Kanban,
    group: "work",
    tourDescription: "Every client project this quarter, tracked by status and health.",
  },
  {
    href: "/portal/tasks",
    label: "Tasks",
    icon: ListTodo,
    group: "work",
    rail: false,
    tourDescription: "All your tasks across every project, in one list.",
  },
  {
    href: "/portal/calendar",
    label: "Calendar",
    icon: CalendarDays,
    keywords: "meeting days deadlines events schedule",
    group: "work",
    tourDescription: "Meeting days, project deadlines, and chapter events in one place.",
  },
  {
    href: "/portal/directory",
    label: "Directory",
    icon: Users,
    group: "people",
    tourDescription: "Everyone in the chapter, searchable by name or role.",
  },
  {
    href: "/portal/attendance",
    label: "Attendance",
    icon: ClipboardCheck,
    group: "people",
    rail: false,
    tourDescription: "Check in for meetings and see your attendance rate.",
  },
  {
    href: "/portal/resources",
    label: "Resources",
    icon: BookOpen,
    group: "reference",
    tourDescription: "The chapter wiki -- training docs, templates, and guides.",
  },
  {
    href: "/portal/quick-links",
    label: "Quick Links",
    icon: Link2,
    keywords: "drive docs slack outside resources",
    group: "reference",
    rail: false,
    tourDescription: "Fast access to shared docs, Drive folders, and other outside resources.",
  },
  {
    href: "/portal/admin",
    label: "Admin",
    icon: ShieldCheck,
    execOnly: true,
    tourDescription: "Manage members, quarters, meeting days, and team assignments.",
  },
];

/** The five places on the admin rail. `href` is where the place opens. */
export const ADMIN_PLACES: { key: AdminGroup; label: string; href: string; icon: LucideIcon }[] = [
  { key: "admin-today", label: "Today", href: "/portal/admin", icon: House },
  { key: "admin-recruiting", label: "Recruiting", href: "/portal/admin/applicants", icon: UsersRound },
  { key: "admin-scheduling", label: "Scheduling", href: "/portal/admin/coffee-chats", icon: CalendarDays },
  { key: "admin-people", label: "People", href: "/portal/admin/members", icon: Users2 },
  { key: "admin-setup", label: "Setup", href: "/portal/admin/quarters", icon: SlidersHorizontal },
];

/** Admin pages -- each belongs to one place. Order within a place is the order of its view switch. */
export const ADMIN_NAV_LINKS: NavLink[] = [
  {
    href: "/portal/admin",
    label: "Today",
    icon: House,
    execOnly: true,
    quarterScoped: true,
    keywords: "admin home hub needs attention",
    group: "admin-today",
  },
  {
    href: "/portal/admin/activity",
    label: "Activity",
    icon: History,
    execOnly: true,
    keywords: "audit log",
    group: "admin-today",
  },
  {
    href: "/portal/admin/applicants",
    label: "Applicants",
    icon: ListOrdered,
    execOnly: true,
    quarterScoped: true,
    keywords: "recruitment recruiting applicants reviews points leaderboard ranking scores attendance info session",
    group: "admin-recruiting",
  },
  {
    href: "/portal/admin/coffee-chats",
    label: "Coffee Chats",
    viewLabel: "Coffee chats",
    icon: CalendarHeart,
    execOnly: true,
    keywords: "recruitment applicants scheduling booking availability",
    group: "admin-scheduling",
  },
  {
    href: "/portal/admin/interviews",
    label: "Interviews",
    icon: ClipboardCheck,
    execOnly: true,
    keywords: "recruitment applicants interview invitees booking availability",
    group: "admin-scheduling",
  },
  {
    href: "/portal/admin/client-meetings",
    label: "Client Meetings",
    viewLabel: "Client calls",
    icon: Handshake,
    execOnly: true,
    keywords: "clients consulting booking availability panel services",
    group: "admin-scheduling",
  },
  {
    href: "/portal/admin/meeting-days",
    label: "Meeting Days",
    viewLabel: "Meeting days",
    icon: CalendarClock,
    execOnly: true,
    keywords: "calendar schedule",
    quarterScoped: true,
    group: "admin-scheduling",
  },
  {
    href: "/portal/admin/members",
    label: "Members",
    viewLabel: "Roster",
    icon: Users,
    execOnly: true,
    keywords: "people bulk create accounts reset password",
    group: "admin-people",
  },
  {
    href: "/portal/admin/team-builder",
    label: "Team Builder",
    viewLabel: "Teams",
    icon: Users2,
    execOnly: true,
    keywords: "people drag drop roster draft plan pm sc",
    quarterScoped: true,
    group: "admin-people",
  },
  {
    href: "/portal/admin/stats",
    label: "Consultant Stats",
    viewLabel: "Stats",
    icon: BarChart3,
    execOnly: true,
    keywords: "people attendance tasks deadlines rollup rankings",
    quarterScoped: true,
    group: "admin-people",
  },
  {
    href: "/portal/admin/team-page",
    label: "Team Page",
    viewLabel: "Team page",
    icon: Camera,
    execOnly: true,
    keywords: "people public photos bios approve pending members",
    group: "admin-people",
  },
  { href: "/portal/admin/quarters", label: "Quarters", icon: CalendarRange, execOnly: true, group: "admin-setup" },
  {
    href: "/portal/admin/recruiting-setup",
    label: "Recruiting Setup",
    viewLabel: "Recruiting",
    icon: ListOrdered,
    execOnly: true,
    quarterScoped: true,
    keywords: "rubric rubrics categories events points review settings scoring",
    group: "admin-setup",
  },
  { href: "/portal/admin/settings", label: "Settings", icon: SlidersHorizontal, execOnly: true, group: "admin-setup" },
];
