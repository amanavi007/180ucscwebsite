import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Kanban,
  ListTodo,
  Users,
  ClipboardCheck,
  BookOpen,
  ShieldCheck,
  Building2,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  DoorOpen,
  SlidersHorizontal,
  Users2,
  History,
  Link2,
} from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  execOnly?: boolean;
  /** Extra terms this page should also match on in search, beyond its label. */
  keywords?: string;
  /** Sidebar grouping only -- unset means "ungrouped" (rendered on its own). */
  group?: "work" | "people";
  /** One-sentence explanation shown for this page in the first-time sidebar tour. */
  tourDescription?: string;
}

export const NAV_LINKS: NavLink[] = [
  {
    href: "/portal",
    label: "Dashboard",
    icon: LayoutDashboard,
    tourDescription: "Your home base -- a quick view of your tasks, your team, and anything that needs attention.",
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
    href: "/portal/clients",
    label: "Clients",
    icon: Building2,
    group: "people",
    tourDescription: "Every client 180 has worked with -- your current projects are highlighted.",
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
    tourDescription: "Check in for meetings and see your attendance rate.",
  },
  {
    href: "/portal/resources",
    label: "Resources",
    icon: BookOpen,
    tourDescription: "The chapter wiki -- training docs, templates, and guides.",
  },
  {
    href: "/portal/quick-links",
    label: "Quick Links",
    icon: Link2,
    keywords: "drive docs slack outside resources",
    tourDescription: "Fast access to shared docs, Drive folders, and other outside resources.",
  },
  {
    href: "/portal/admin",
    label: "Admin",
    icon: ShieldCheck,
    execOnly: true,
    tourDescription: "Manage members, quarters, rooms, and team assignments.",
  },
];

/** Admin sub-pages -- shared between the Admin tab bar and the command palette. */
export const ADMIN_NAV_LINKS: NavLink[] = [
  { href: "/portal/admin", label: "Members", icon: Users, execOnly: true, keywords: "bulk create accounts reset password" },
  { href: "/portal/admin/quarters", label: "Quarters", icon: CalendarRange, execOnly: true },
  {
    href: "/portal/admin/meeting-days",
    label: "Meeting Days",
    icon: CalendarClock,
    execOnly: true,
    keywords: "calendar schedule",
  },
  { href: "/portal/admin/rooms", label: "Rooms", icon: DoorOpen, execOnly: true, keywords: "library booking floor plan" },
  { href: "/portal/admin/settings", label: "Settings", icon: SlidersHorizontal, execOnly: true },
  {
    href: "/portal/admin/team-builder",
    label: "Team Builder",
    icon: Users2,
    execOnly: true,
    keywords: "drag drop roster draft plan pm sc",
  },
  { href: "/portal/admin/activity", label: "Activity", icon: History, execOnly: true, keywords: "audit log" },
];
