import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { listBookings, listGuests, listHouses } from '@/lib/db';
import AdminNav from '@/components/AdminNav';
import CsvImport from '@/components/CsvImport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function UploadPage({ searchParams }: { searchParams: { house?: string } }) {
  const admin = requireAdmin();
  if (!admin.houses.includes('*')) redirect('/admin');
  const [houses, bookings, guests] = await Promise.all([listHouses(), listBookings(), listGuests()]);
  // Registered guests per Airbnb code, to pre-fill the people count.
  const registered: Record<string, number> = {};
  for (const b of bookings) if (b.booking_ref) registered[b.booking_ref] = guests.filter((g) => g.token === b.token).length;
  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <CsvImport houses={houses.map((h) => ({ id: h.id, name: h.name }))} initialHouse={searchParams.house} registered={registered} />
      </main>
    </>
  );
}
