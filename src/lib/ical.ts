import 'server-only';

// Reads a house's Airbnb (or Booking.com) calendar export link.
// Airbnb's feed only includes dates, the confirmation code, and the last 4 digits
// of the guest's phone. No names or guest counts.
export type Reservation = {
  house_id: string;
  check_in: string; // YYYY-MM-DD
  check_out: string;
  code: string; // e.g. HMABC12345 (empty if the feed has none)
  phone_last4: string;
};

const toDate = (v: string) => {
  const m = v.match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

export function parseIcal(text: string, houseId: string): Reservation[] {
  // Unfold continuation lines, then split into events.
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: Reservation[] = [];
  let ev: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') ev = {};
    else if (line === 'END:VEVENT' && ev) {
      const summary = ev.SUMMARY ?? '';
      const desc = (ev.DESCRIPTION ?? '').replace(/\\n/g, '\n');
      // Skip blocked / unavailable dates; keep real reservations.
      if (!/not available|blocked|closed/i.test(summary)) {
        out.push({
          house_id: houseId,
          check_in: toDate(ev.DTSTART ?? ''),
          check_out: toDate(ev.DTEND ?? ''),
          code: desc.match(/details\/([A-Z0-9]{6,})/)?.[1] ?? '',
          phone_last4: desc.match(/Last 4 Digits\)?:?\s*(\d{4})/i)?.[1] ?? '',
        });
      }
      ev = null;
    } else if (ev) {
      const i = line.indexOf(':');
      if (i > 0) ev[line.slice(0, i).split(';')[0].toUpperCase()] = line.slice(i + 1);
    }
  }
  return out.filter((r) => r.check_in && r.check_out);
}

export async function upcomingReservations(houses: { id: string; ical_url: string }[]) {
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // JST
  const errors: string[] = [];
  const lists = await Promise.all(
    houses
      .map((h) => ({ ...h, ical_url: h.ical_url.trim().replace(/^webcal:\/\//i, 'https://') }))
      .filter((h) => /^https?:\/\//i.test(h.ical_url))
      .map(async (h) => {
        try {
          const res = await fetch(h.ical_url, { next: { revalidate: 600 }, headers: { 'User-Agent': 'minpaku-register' } });
          if (!res.ok) throw new Error(String(res.status));
          return parseIcal(await res.text(), h.id);
        } catch {
          errors.push(h.id);
          return [];
        }
      }),
  );
  const reservations = lists
    .flat()
    .filter((r) => r.check_out >= today)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));
  return { reservations, errors };
}
