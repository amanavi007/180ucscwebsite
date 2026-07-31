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
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: Kanban, group: "work" },
  { href: "/tasks", label: "Tasks", icon: ListTodo, group: "work" },
  {
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    keywords: "meeting days deadlines events schedule",
    group: "work",
  },
  { href: "/clients", label: "Clients", icon: Building2, group: "people" },
  { href: "/directory", label: "Directory", icon: Users, group: "people" },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck, group: "people" },
  { href: "/resources", label: "Resources", icon: BookOpen },
  { href: "/admin", label: "Admin", icon: ShieldCheck, execOnly: true },
];

/** Admin sub-pages -- shared between the Admin tab bar and the command palette. */
export const ADMIN_NAV_LINKS: NavLink[] = [
  { href: "/admin", label: "Members", icon: Users, execOnly: true, keywords: "bulk create accounts reset password" },
  { href: "/admin/quarters", label: "Quarters", icon: CalendarRange, execOnly: true },
  {
    href: "/admin/meeting-days",
    label: "Meeting Days",
    icon: CalendarClock,
    execOnly: true,
    keywords: "calendar schedule",
  },
  { href: "/admin/rooms", label: "Rooms", icon: DoorOpen, execOnly: true, keywords: "library booking floor plan" },
  { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal, execOnly: true },
  {
    href: "/admin/team-builder",
    label: "Team Builder",
    icon: Users2,
    execOnly: true,
    keywords: "drag drop roster draft plan pm sc",
  },
  { href: "/admin/activity", label: "Activity", icon: History, execOnly: true, keywords: "audit log" },
];
