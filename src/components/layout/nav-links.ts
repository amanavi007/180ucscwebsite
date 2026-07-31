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
} from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  execOnly?: boolean;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: Kanban },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/directory", label: "Directory", icon: Users },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/resources", label: "Resources", icon: BookOpen },
  { href: "/admin", label: "Admin", icon: ShieldCheck, execOnly: true },
];
