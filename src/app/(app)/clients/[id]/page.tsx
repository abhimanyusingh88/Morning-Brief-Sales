import { redirect, notFound } from 'next/navigation';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { focusCoverage, getCoverage, getFocus, validId } from '@/lib/live/reports';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  const { id } = await params;
  if (!validId(id)) notFound();
  const db = await getDb(),
    c = focusCoverage(await getCoverage(db, me.id), await getFocus(db, me.id));
  if (!c.clients.some((x) => x.id === id)) notFound();
  redirect('/brief?client=' + id);
}
