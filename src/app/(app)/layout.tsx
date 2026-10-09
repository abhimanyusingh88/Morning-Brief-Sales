import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth/session';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
export const dynamic='force-dynamic';
export default async function AppLayout({children}:{children:React.ReactNode}){const me=await getMe();if(!me)redirect('/login');return <><a href="#main-content" className="skip-link">Skip to content</a><div className="app-shell flex h-dvh overflow-hidden"><Sidebar role={me.role} firm="Morning Brief"/><div className="app-column flex min-h-0 min-w-0 flex-1 flex-col"><Topbar me={me} hue={me.hue} firm="Morning Brief"/><main id="main-content" tabIndex={-1} className="app-main min-h-0 flex-1 overflow-y-auto focus:outline-none"><div className="workspace-content mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-5 lg:px-6 lg:py-6">{children}</div></main></div></div></>}
