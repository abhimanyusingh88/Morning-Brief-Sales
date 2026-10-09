import { UserMenu } from './user-menu';
import { MobileNav } from './mobile-nav';
import type { Me } from '@/lib/auth/session';
export function Topbar({me,hue,firm}:{me:Me;hue:number;firm:string;asOf?:string;sources?:string}){return <header className="app-topbar z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8"><MobileNav role={me.role} firm={firm}/><div className="min-w-0"><p className="text-sm font-semibold text-ink">Market intelligence</p><p className="text-xs text-muted">US markets · Eastern Time</p></div><div className="ml-auto"><UserMenu name={me.fullName} title={me.title} initials={me.initials} hue={hue}/></div></header>}
