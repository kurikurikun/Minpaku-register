import { NextResponse } from 'next/server';
import { addGuest, getBooking, guestsForBooking, isExpired, listHouses, uploadPhoto } from '@/lib/db';
import { notify } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_PHOTO = 8 * 1024 * 1024;
const clean = (v: FormDataEntryValue | null, max = 300) => String(v ?? '').trim().slice(0, max);

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const booking = await getBooking(params.token);
  if (!booking || isExpired(booking)) return new NextResponse('Not found', { status: 404 });

  const existing = await guestsForBooking(booking.token);
  if (existing.length >= booking.guests) return new NextResponse('Already complete', { status: 409 });

  const fd = await req.formData();
  const g = {
    guest_no: clean(fd.get('guest_no'), 3),
    full_name: clean(fd.get('full_name'), 120),
    lives_in_japan: clean(fd.get('lives_in_japan'), 3),
    nationality: clean(fd.get('nationality'), 80),
    passport_no: clean(fd.get('passport_no'), 30).toUpperCase(),
    address: clean(fd.get('address'), 400),
    occupation: clean(fd.get('occupation'), 120),
    phone: clean(fd.get('phone'), 40),
    email: clean(fd.get('email'), 120),
    lang: clean(fd.get('lang'), 5),
  };

  const foreign = g.lives_in_japan === 'no';
  if (!g.full_name || !['yes', 'no'].includes(g.lives_in_japan) || !g.address || !g.occupation) {
    return new NextResponse('Missing fields', { status: 400 });
  }
  if (foreign && (!g.nationality || !g.passport_no)) return new NextResponse('Missing passport details', { status: 400 });

  const houses = await listHouses();
  const house = houses.find((h) => h.id === booking.house_id);

  let passport_file_id = '', passport_url = '';
  const photo = fd.get('photo');
  if (foreign) {
    if (!(photo instanceof File) || photo.size === 0) return new NextResponse('Passport photo required', { status: 400 });
    if (photo.size > MAX_PHOTO || !photo.type.startsWith('image/')) return new NextResponse('Invalid photo', { status: 400 });
    const safeName = g.full_name.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40);
    const ext = photo.type === 'image/png' ? 'png' : 'jpg';
    const up = await uploadPhoto(
      `${booking.check_in}_${booking.house_id}_${safeName}_${g.passport_no}.${ext}`,
      photo.type,
      Buffer.from(await photo.arrayBuffer()),
    );
    passport_file_id = up.id;
    passport_url = up.url;
  }

  await addGuest({
    ...g,
    token: booking.token,
    house_id: booking.house_id,
    house_name: house?.name ?? booking.house_id,
    check_in: booking.check_in,
    check_out: booking.check_out,
    passport_file_id,
    passport_url,
  });

  // Email the owner once every guest in the booking has registered.
  if (existing.length + 1 >= booking.guests) {
    const all = [...existing.map((e) => e.full_name), g.full_name];
    const base = process.env.APP_URL?.replace(/\/$/, '') || new URL(req.url).origin;
    await notify(
      house?.notify_email,
      `Check-in complete: ${house?.name ?? booking.house_id} ${booking.check_in} (${booking.lead_name || g.full_name})`,
      [
        `${house?.name ?? booking.house_id}`,
        `${booking.check_in} → ${booking.check_out}`,
        `Booking: ${booking.booking_ref || '-'}  Lead: ${booking.lead_name || '-'}`,
        '',
        'Guests:',
        ...all.map((n, i) => `  ${i + 1}. ${n}`),
        '',
        `Details: ${base}/admin/b/${booking.token}`,
      ].join('\n'),
    );
  }

  return NextResponse.json({ ok: true });
}
