import { Sunrise } from "lucide-react";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getMe } from "@/lib/auth/session";
import { HOME } from "@/components/shell/nav";
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
      <div className="mx-auto max-w-[1080px] px-6 pb-20 pt-14">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-cyan"><Sunrise size={22} /></span>
          <div><p className="text-lg font-semibold tracking-[-0.01em]">Morning Brief</p><p className="text-[12.5px] text-white/50">Northgate Capital Markets · demo workspace</p></div>
        </div>
        <h1 className="mt-12 max-w-3xl text-balance text-[40px] font-semibold leading-[1.08] tracking-[-0.025em]">Who to call, why now, and what to say.</h1>
        <p className="mt-3 max-w-xl text-[15.5px] text-white/60">Choose a person to see their morning. Everyone sees only their own clients and book. The firm, clients and prices are synthetic.</p>
        <PersonaGrid personas={personas} />
      </div>
    </main>
  );
}
