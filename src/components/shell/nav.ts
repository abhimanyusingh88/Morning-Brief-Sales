import { BookOpenText, SlidersHorizontal, Users, type LucideIcon } from 'lucide-react';
import type { Role } from '@/lib/auth/session';
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}
const roles: Role[] = ['sales', 'desk_head', 'compliance', 'admin'];
export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Workspace',
    items: [
      { href: '/brief', label: 'Market brief', icon: BookOpenText, roles },
      { href: '/clients', label: 'Client coverage', icon: Users, roles },
    ],
  },
  { group: 'Account', items: [{ href: '/setup', label: 'My interests', icon: SlidersHorizontal, roles }] },
];
export const HOME: Record<Role, string> = {
  sales: '/brief',
  desk_head: '/brief',
  compliance: '/brief',
  admin: '/brief',
};
