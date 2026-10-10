'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { Role } from '@/lib/auth/session';
import { NAV } from './nav';

/** The primary navigation, shared by the fixed sidebar and the mobile drawer so they can never drift apart. */
export function NavList({ role, onNavigate, roomy }: { role: Role; onNavigate?: () => void; roomy?: boolean }) {
  const path = usePathname();
  return (
    <nav className="space-y-4" aria-label="Primary">
      {NAV.map((g) => {
        const items = g.items.filter((i) => i.roles.includes(role));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">{g.group}</p>
            <ul className="space-y-px">
              {items.map((i) => {
                const active = path === i.href || path.startsWith(i.href + '/');
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-white',
                        roomy ? 'py-2.5' : 'py-2',
                        active ? 'bg-white/[0.12] text-white' : 'text-white/70 hover:bg-white/[0.06] hover:text-white',
                      )}
                    >
                      <i.icon
                        size={17}
                        strokeWidth={1.7}
                        className={active ? 'shrink-0 text-cyan' : 'shrink-0 text-white/55'}
                      />
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
