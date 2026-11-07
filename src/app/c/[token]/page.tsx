import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getBooking, guestsForBooking, housePhoto, isExpired, listHouses } from '@/lib/db';
import { DICTS, LANGS, type Lang } from '@/lib/i18n';
import CheckinForm from '@/components/CheckinForm';

export const dynamic = 'force-dynamic';

function pickLang(): Lang {
  const al = headers().get('accept-language')?.toLowerCase() ?? '';
  for (const part of al.split(',')) {
    const code = part.trim().slice(0, 2);
    if (LANGS.some((l) => l.code === code)) return code as Lang;
  }
  return 'en';
}

export default async function CheckinPage({ params }: { params: { token: string } }) {
  const booking = await getBooking(params.token);
  if (!booking) notFound();
  const lang = pickLang();
  const t = DICTS[lang];

  if (isExpired(booking)) return <Message text={t.expired} />;

  const [houses, done] = await Promise.all([listHouses(), guestsForBooking(booking.token)]);
  const remaining = booking.guests - done.length;
  if (remaining <= 0) return <Message text={t.alreadyDone} />;

  const house = houses.find((h) => h.id === booking.house_id);
  return (
    <CheckinForm
      token={booking.token}
      initialLang={lang}
      houseName={house?.name ?? booking.house_id}
      photoUrl={housePhoto(house)}
      checkIn={booking.check_in}
      checkOut={booking.check_out}
      totalGuests={booking.guests}
      startNo={done.length + 1}
    />
  );
}

function Message({ text }: { text: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6 text-center">
      <p className="card text-lg">{text}</p>
    </main>
  );
}
