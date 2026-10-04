import { Activity, BarChart3, BookOpenText, LayoutDashboard, PhoneCall, Settings, ShieldCheck, SlidersHorizontal, Users, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/auth/session";

export interface NavItem { href: string; label: string; icon: LucideIcon; roles: Role[] }

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "My day",
    items: [
      { href: "/today", label: "Today", icon: LayoutDashboard, roles: ["sales"] },
      { href: "/calls", label: "Call list", icon: PhoneCall, roles: ["sales"] },
      { href: "/brief", label: "Morning brief", icon: BookOpenText, roles: ["sales"] },
      { href: "/clients", label: "Clients", icon: Users, roles: ["sales", "desk_head"] },
    ],
  },
  {
    group: "Desk",
    items: [
      { href: "/desk", label: "Desk overview", icon: BarChart3, roles: ["desk_head"] },
      { href: "/pipeline", label: "Pipeline", icon: Activity, roles: ["desk_head", "admin", "compliance"] },
    ],
  },
  {
    group: "Oversight",
    items: [
      { href: "/compliance", label: "Compliance", icon: ShieldCheck, roles: ["compliance", "admin"] },
      { href: "/demo-control", label: "Demo control", icon: SlidersHorizontal, roles: ["admin"] },
    ],
  },
  {
    group: "Account",
    items: [{ href: "/settings", label: "Preferences", icon: Settings, roles: ["sales", "desk_head"] }],
  },
];

export const HOME: Record<Role, string> = { sales: "/today", desk_head: "/desk", compliance: "/compliance", admin: "/pipeline" };
