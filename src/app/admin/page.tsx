import Link from 'next/link';
import { canSee, requireAdmin } from '@/lib/auth';
import { listBookings, listGuests, listHouses } from '@/lib/db';
import AdminNav from '@/components/AdminNav';
import NewBookingForm from '@/components/NewBookingForm';

export const dynamic = 'force-dynamic';

export default async function AdminHome({ searchParams }: { searchParams: { past?: string } }) {
  const admin = requireAdmin();
  const [allHouses, bookings, guests] = await Promise.all([listHouses(), listBookings(), listGuests()]);
  const houses = allHouses.filter((h) => canSee(admin, h.id));
  const showPast = searchParams.past === '1';
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // JST
  const counts = new Map<string, number>();
  for (const g of guests) counts.set(g.token, (counts.get(g.token) ?? 0) + 1);
  const houseName = (id: string) => houses.find((h) => h.id === id)?.name ?? id;

  const list = bookings
    .filter((b) => canSee(admin, b.house_id))
    .filter((b) => (showPast ? b.check_out < today : b.check_out >= today))
    .sort((a, b) => (showPast ? b.check_in.localeCompare(a.check_in) : a.check_in.localeCompare(b.check_in)));

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <NewBookingForm houses={houses} />

        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{showPast ? 'Past bookings' : 'Upcoming bookings'}</h2>
            <Link href={showPast ? '/admin' : '/admin?past=1'} className="text-sm text-sea hover:underline">
              {showPast ? 'Show upcoming' : 'Show past'}
            </Link>
          </div>
          {list.length === 0 && <p className="text-stone-500">No bookings.</p>}
          <ul className="divide-y divide-stone-100">
            {list.map((b) => {
              const n = counts.get(b.token) ?? 0;
              const complete = n >= b.guests;
              return (
                <li key={b.token}>
                  <Link href={`/admin/b/${b.token}`} className="flex items-center gap-3 py-3 hover:bg-stone-50">
                    <div className="w-28 shrink-0 text-sm">
                      <div className="font-semibold">{b.check_in}</div>
                      <div className="text-stone-500">→ {b.check_out}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{b.lead_name || b.booking_ref || 'Booking'}</div>
                      <div className="truncate text-sm text-stone-500">{houseName(b.house_id)}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {n}/{b.guests} {complete ? '✓' : ''}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </>
  );
}
