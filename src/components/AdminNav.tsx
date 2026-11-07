import Link from 'next/link';
import { logout } from '@/app/admin/actions';
import { getAdmin } from '@/lib/auth';

export default function AdminNav() {
  const admin = getAdmin();
  return (
    <header className="no-print border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
        <Link href="/admin" className="font-semibold text-sea">Guest Check-in</Link>
        <Link href="/admin" className="hover:underline">Bookings</Link>
        <Link href="/admin/register" className="hover:underline">Register 名簿</Link>
        <form action={logout} className="ml-auto flex items-center gap-3">
          <span className="hidden text-stone-500 sm:inline">{admin?.user}</span>
          <button className="text-stone-500 hover:underline">Log out</button>
        </form>
      </div>
    </header>
  );
}
