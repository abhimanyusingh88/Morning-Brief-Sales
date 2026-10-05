import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getMe } from "@/lib/auth/session";
import { HOME } from "@/components/shell/nav";
import { BrandLogo } from "@/components/shell/brand";
import { PersonaGrid, type Persona } from "./persona-grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function Login() {
  const me = await getMe();
  if (me) redirect(HOME[me.role]);
  const db = await getDb();
  const rows = await db.asService((q) => q(
    `select p.id, p.full_name, p.initials, p.title, p.role, p.avatar_hue, d.name desk_name, d.code desk_code,
            (select count(*)::int from coverage c where c.profile_id = p.id) clients
       from profiles p left join desks d on d.id = p.desk_id where p.is_active
       order by d.code nulls last, case p.role when 'desk_head' then 0 when 'sales' then 1 else 2 end, p.full_name`));
  const personas: Persona[] = rows.map((r) => ({ id: String(r.id), name: String(r.full_name), initials: String(r.initials), title: String(r.title), role: r.role as Persona["role"], hue: Number(r.avatar_hue), desk: (r.desk_name as string) ?? null, clients: Number(r.clients) }));
  return (
    <main className="min-h-screen bg-navy text-white">
      <div className="mx-auto max-w-[1080px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <div className="flex items-center gap-3">
          <BrandLogo size={200} />
        </div>
        <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">Your workspace</p>
        <h1 className="mt-3 max-w-3xl text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[40px]">A clearer start to your morning.</h1>
        <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-white/70">Select your account to access your brief, client coverage and call priorities.</p>
        <PersonaGrid personas={personas} />
      </div>
    </main>
  );
}
