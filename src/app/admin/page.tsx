import Link from 'next/link';
import { canSee, requireAdmin } from '@/lib/auth';
import { listBookings, listGuests, listHouses } from '@/lib/db';
import AdminNav from '@/components/AdminNav';
import NewBookingForm from '@/components/NewBookingForm';
import { upcomingReservations } from '@/lib/ical';

export const dynamic = 'force-dynamic';

export default async function AdminHome({ searchParams }: { searchParams: { past?: string } }) {
  const admin = requireAdmin();
  const [allHouses, bookings, guests] = await Promise.all([listHouses(), listBookings(), listGuests()]);
  const houses = allHouses.filter((h) => canSee(admin, h.id));
  const { reservations, errors: calErrors } = await upcomingReservations(houses);
  const linkedRefs = bookings.map((b) => b.booking_ref).filter(Boolean);
  const showPast = searchParams.past === '1';
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // JST
  const counts = new Map<string, number>();
  // Main contact's name from the registration, used when no lead name was typed in.
  const leadFromGuests = new Map<string, string>();
  for (const g of guests) {
    counts.set(g.token, (counts.get(g.token) ?? 0) + 1);
    if (g.guest_no === '1' || !leadFromGuests.has(g.token)) leadFromGuests.set(g.token, g.full_name);
  }
  const houseName = (id: string) => houses.find((h) => h.id === id)?.name ?? id;

  const list = bookings
    .filter((b) => canSee(admin, b.house_id))
    .filter((b) => (showPast ? b.check_out < today : b.check_out >= today))
    .sort((a, b) => (showPast ? b.check_in.localeCompare(a.check_in) : a.check_in.localeCompare(b.check_in)));

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <NewBookingForm
          houses={houses}
          reservations={reservations}
          linkedRefs={linkedRefs}
          calErrors={calErrors}
        />

        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{showPast ? 'Past bookings' : 'Upcoming bookings'}</h2>
            <Link href={showPast ? '/admin' : '/admin?past=1'} className="text-sm text-sea hover:underline">
              {showPast ? 'Show upcoming' : 'Show past'}
            </Link>
          </div>
          {list.length === 0 && <p className="text-neutral-500">No bookings.</p>}
          <ul className="divide-y divide-black/5">
            {list.map((b) => {
              const n = counts.get(b.token) ?? 0;
              const complete = n >= b.guests;
              return (
                <li key={b.token}>
                  <Link href={`/admin/b/${b.token}`} className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-white/50">
                    <div className="w-28 shrink-0 text-sm">
                      <div className="font-semibold">{b.check_in}</div>
                      <div className="text-neutral-500">→ {b.check_out}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{b.lead_name || leadFromGuests.get(b.token) || b.booking_ref || 'Booking'}</div>
                      {!b.lead_name && leadFromGuests.has(b.token) && b.booking_ref && <div className="truncate text-xs text-neutral-500">{b.booking_ref}</div>}
                      <div className="truncate text-sm text-neutral-500">{houseName(b.house_id)}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${complete ? 'glass-dark text-white' : 'glass text-neutral-700'}`}>
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
