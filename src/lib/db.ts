import 'server-only';
import { randomBytes } from 'node:crypto';
import { cache } from 'react';
import { store } from './store';

// The Google Sheet is the database. Tabs are created automatically on first use.
// Edit the Houses tab directly in Google Sheets to rename houses, add houses,
// or set who gets the "check-in complete" email for each house.
const SCHEMA = {
  Houses: ['id', 'name', 'photo_url', 'address', 'license_no', 'notify_email'],
  Bookings: ['token', 'house_id', 'check_in', 'check_out', 'guests', 'lead_name', 'booking_ref', 'notes', 'created_by', 'created_at'],
  Guests: [
    'submitted_at', 'token', 'house_id', 'house_name', 'check_in', 'check_out', 'guest_no',
    'full_name', 'lives_in_japan', 'nationality', 'passport_no', 'address', 'occupation',
    'phone', 'email', 'passport_file_id', 'passport_url', 'lang',
  ],
} as const;

const SEED = {
  Houses: [
    { id: 'shinagawa', name: 'Shinagawa Family House' },
    { id: 'hayama', name: 'Hayama Retreat' },
  ],
};

type Cols<T extends keyof typeof SCHEMA> = (typeof SCHEMA)[T][number];
export type House = Record<Cols<'Houses'>, string>;
export type Booking = Omit<Record<Cols<'Bookings'>, string>, 'guests'> & { guests: number };
export type Guest = Record<Cols<'Guests'>, string>;

let ensured = false;
async function ensure() {
  if (ensured) return;
  await store.ensure(SCHEMA, SEED);
  ensured = true;
}

function shape<T extends keyof typeof SCHEMA>(tab: T, rows: Record<string, string>[]) {
  return rows.map((r) => Object.fromEntries(SCHEMA[tab].map((c) => [c, r[c] ?? ''])) as Record<Cols<T>, string>);
}

// One round trip for all tabs, shared within a single page render.
const snapshot = cache(async () => {
  await ensure();
  const d = await store.read(['Houses', 'Bookings', 'Guests']);
  return {
    houses: shape('Houses', d.Houses ?? []).filter((h) => h.id),
    bookings: shape('Bookings', d.Bookings ?? []).map((b) => ({ ...b, guests: Number(b.guests) || 1 })),
    guests: shape('Guests', d.Guests ?? []),
  };
});

// Accepts a file path in /public, a direct https image link, or a Google Drive share link (file must be shared
// "Anyone with the link"), which is converted to an embeddable image URL.
export function housePhoto(h?: House) {
  const url = h?.photo_url?.trim() ?? '';
  if (/^\/[\w/.-]+$/.test(url)) return url; // file in /public, e.g. /houses/hayama.jpg
  if (!/^https:\/\//i.test(url)) return undefined;
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
  return drive ? `https://lh3.googleusercontent.com/d/${drive[1]}=w1600` : url;
}

export async function listHouses(): Promise<House[]> {
  return (await snapshot()).houses;
}
export async function listBookings(): Promise<Booking[]> {
  return (await snapshot()).bookings;
}
export async function listGuests(): Promise<Guest[]> {
  return (await snapshot()).guests;
}

export async function getBooking(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return (await listBookings()).find((b) => b.token === token) ?? null;
}

export async function guestsForBooking(token: string) {
  return (await listGuests()).filter((g) => g.token === token);
}

export async function createBooking(b: Omit<Booking, 'token' | 'created_at'>) {
  await ensure();
  const token = randomBytes(16).toString('base64url');
  await store.append('Bookings', { ...b, token, created_at: new Date().toISOString() });
  return token;
}

export async function addGuest(g: Partial<Guest>) {
  await ensure();
  await store.append('Guests', { ...g, submitted_at: new Date().toISOString() });
}

export const uploadPhoto = store.upload;
export const downloadPhoto = store.download;

// Links stay open until 7 days after check-out.
export function isExpired(b: Booking) {
  const end = new Date(`${b.check_out}T23:59:59+09:00`);
  return Date.now() > end.getTime() + 7 * 86400_000;
}
