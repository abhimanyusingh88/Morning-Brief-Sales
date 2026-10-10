import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth/session';
import { HOME } from '@/components/shell/nav';

export default async function Home() {
  const me = await getMe();
  redirect(me ? HOME[me.role] : '/brief');
}
