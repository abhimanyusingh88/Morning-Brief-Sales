import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Market brief' };
export default function Login() {
  redirect('/brief');
}
