import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getPreferences } from '@/lib/live/reports';
import { Interests } from '@/components/live/interests';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'My interests' };
export default async function Page() {
  const me = await getMe();
  if (!me) redirect('/login');
  const prefs = await getPreferences(await getDb(), me.id);
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <p className="eyebrow">Personalise your coverage</p>
        <h1 className="mt-1 text-3xl font-semibold">My interests</h1>
        <p className="mt-2 text-sm text-muted">
          News is matched to your assigned client holdings and the topics you cover.
        </p>
      </header>
      <Interests prefs={prefs} />
    </div>
  );
}
