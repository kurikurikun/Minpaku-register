import { notFound } from 'next/navigation';
import { canSee, requireAdmin } from '@/lib/auth';
import { getBooking, guestsForBooking, listHouses } from '@/lib/db';
import { baseUrl } from '@/lib/url';
import AdminNav from '@/components/AdminNav';
import CopyButton from '@/components/CopyButton';

export const dynamic = 'force-dynamic';

export default async function BookingPage({ params, searchParams }: { params: { token: string }; searchParams: { new?: string } }) {
  const admin = requireAdmin();
  const booking = await getBooking(params.token);
  if (!booking || !canSee(admin, booking.house_id)) notFound();
  const [houses, guests] = await Promise.all([listHouses(), guestsForBooking(booking.token)]);
  const house = houses.find((h) => h.id === booking.house_id);
  const houseName = house?.name ?? booking.house_id;
  const link = `${baseUrl()}/c/${booking.token}`;
  const lead = booking.lead_name || guests.find((g) => g.guest_no === '1')?.full_name || guests[0]?.full_name || '';
  const hi = booking.lead_name ? ` ${booking.lead_name}` : '';

  const msgEn = `Hi${hi}! Thanks for booking ${houseName}. Japanese law requires us to register every guest before arrival (name, address, occupation, and a passport photo for guests living outside Japan). It only takes a few minutes — please complete it for all ${booking.guests} guests here:\n${link}`;
  const msgJa = `${booking.lead_name ? booking.lead_name + '様\n' : ''}この度は${houseName}をご予約いただきありがとうございます。住宅宿泊事業法により、ご到着前に宿泊者全員（${booking.guests}名）の情報登録をお願いしております。下記リンクよりご記入ください。\n${link}`;

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl space-y-6 overflow-hidden px-4 py-6">
        {searchParams.new && <p className="glass rounded-2xl p-3 text-neutral-900">Booking created. Send the link below to your guest.</p>}

        <section className="card space-y-1">
          <h1 className="text-xl font-semibold">{houseName}</h1>
          <p>{booking.check_in} → {booking.check_out} · {booking.guests} {booking.guests === 1 ? 'guest' : 'guests'}</p>
          {lead && <p className="text-neutral-600">Lead: {lead}</p>}
          {booking.booking_ref && <p className="text-neutral-600">Ref: {booking.booking_ref}</p>}
          {booking.notes && <p className="text-neutral-600">Notes: {booking.notes}</p>}
        </section>

        <section className="card space-y-4">
          <h2 className="text-lg font-semibold">Check-in link</h2>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-white/50 px-3 py-2 text-sm ring-1 ring-white/80">{link}</code>
            <CopyButton text={link} />
          </div>
          {[['Message (English)', msgEn], ['メッセージ（日本語）', msgJa]].map(([label, msg]) => (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="label mb-0">{label}</span>
                <CopyButton text={msg} />
              </div>
              <pre className="whitespace-pre-wrap break-all rounded-2xl bg-white/45 p-3 text-sm text-neutral-700 ring-1 ring-white/80">{msg}</pre>
            </div>
          ))}
        </section>

        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">Guests ({guests.length}/{booking.guests})</h2>
          {guests.length === 0 && <p className="text-neutral-500">Nobody has registered yet.</p>}
          <div className="space-y-4">
            {guests.map((g, i) => (
              <div key={i} className="flex flex-col gap-4 rounded-3xl bg-white/40 p-4 ring-1 ring-white/80 sm:flex-row">
                <dl className="grid flex-1 grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-neutral-500">Name</dt><dd className="font-semibold">{g.full_name}</dd>
                  <dt className="text-neutral-500">Lives in Japan</dt><dd>{g.lives_in_japan}</dd>
                  {g.nationality && <><dt className="text-neutral-500">Nationality</dt><dd>{g.nationality}</dd></>}
                  {g.passport_no && <><dt className="text-neutral-500">Passport no.</dt><dd>{g.passport_no}</dd></>}
                  <dt className="text-neutral-500">Address</dt><dd className="whitespace-pre-wrap">{g.address}</dd>
                  <dt className="text-neutral-500">Occupation</dt><dd>{g.occupation}</dd>
                  {g.phone && <><dt className="text-neutral-500">Phone</dt><dd>{g.phone}</dd></>}
                  {g.email && <><dt className="text-neutral-500">Email</dt><dd>{g.email}</dd></>}
                  <dt className="text-neutral-500">Submitted</dt><dd>{new Date(g.submitted_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST</dd>
                </dl>
                {g.passport_file_id && (
                  <a href={g.passport_url} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/admin/photo/${g.passport_file_id}`} alt="Passport" className="h-40 w-full rounded-2xl object-contain ring-1 ring-white/80 sm:w-60" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
