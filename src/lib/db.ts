import 'server-only';
import { randomBytes } from 'node:crypto';
import { cache } from 'react';
import { store } from './store';

// The Google Sheet is the database. Tabs are created automatically on first use.
// Edit the Houses tab directly in Google Sheets to rename houses, add houses,
// or set who gets the "check-in complete" email for each house.
const SCHEMA = {
  Houses: ['id', 'name', 'photo_url', 'ical_url', 'address', 'license_no', 'notify_email', 'cleaning_fee', 'manager_name', 'manager_pct', 'tax_per_night', 'tax_min_price', 'tax_from'],
  Bookings: ['token', 'house_id', 'check_in', 'check_out', 'guests', 'lead_name', 'booking_ref', 'notes', 'created_by', 'created_at'],
  Guests: [
    'submitted_at', 'token', 'house_id', 'house_name', 'check_in', 'check_out', 'guest_no',
    'full_name', 'lives_in_japan', 'nationality', 'passport_no', 'address', 'occupation',
    'phone', 'email', 'passport_file_id', 'passport_url', 'lang',
  ],
  // Deleting a booking adds a row here. The booking and its guests are hidden in the app
  // and its link stops working, but the original rows stay (guest records must be kept 3 years).
  Deleted: ['token', 'deleted_at', 'deleted_by'],
  // Income: one row per stay (latest row per house + code wins; removed=1 hides it).
  Income: ['house_id', 'month', 'code', 'guest', 'check_in', 'check_out', 'nights', 'people', 'amount', 'occupancy_tax', 'removed', 'saved_by', 'saved_at'],
  // Expenses: monthly costs per house (latest row per house + month + item wins).
  Expenses: ['house_id', 'month', 'item', 'amount', 'saved_by', 'saved_at'],
} as const;

const SEED: { Houses: Record<string, string>[] } = {
  Houses: [
    { id: 'shinagawa', name: 'Shinagawa Family House' },
    { id: 'hayama', name: 'Hayama Retreat' },
    // Hiroshima Prefecture accommodation tax: ¥200 per person-night when the price is ¥6,000+ per person-night (from 2026-04-01).
    { id: 'hiroshima', name: 'Hiroshima House', cleaning_fee: '10000', manager_name: 'Joy', manager_pct: '20', tax_per_night: '200', tax_min_price: '6000', tax_from: '2026-04-01' },
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
  // Add any seed house that isn't in the Houses tab yet (e.g. a house added after setup).
  const existing = new Set((await store.read(['Houses'])).Houses?.map((h) => h.id) ?? []);
  for (const h of SEED.Houses) if (!existing.has(h.id)) await store.append('Houses', h);
  ensured = true;
}

function shape<T extends keyof typeof SCHEMA>(tab: T, rows: Record<string, string>[]) {
  return rows.map((r) => Object.fromEntries(SCHEMA[tab].map((c) => [c, r[c] ?? ''])) as Record<Cols<T>, string>);
}

// One round trip for all tabs, shared within a single page render.
const snapshot = cache(async () => {
  await ensure();
  const d = await store.read(['Houses', 'Bookings', 'Guests', 'Deleted']);
  const deleted = new Set(shape('Deleted', d.Deleted ?? []).map((r) => r.token));
  return {
    houses: shape('Houses', d.Houses ?? []).filter((h) => h.id),
    bookings: shape('Bookings', d.Bookings ?? [])
      .filter((b) => !deleted.has(b.token))
      .map((b) => ({ ...b, guests: Number(b.guests) || 1 })),
    guests: shape('Guests', d.Guests ?? []).filter((g) => !deleted.has(g.token)),
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

export async function deleteBooking(token: string, by: string) {
  await ensure();
  await store.append('Deleted', { token, deleted_at: new Date().toISOString(), deleted_by: by });
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

// ---- Income ----

export type IncomeRow = Record<Cols<'Income'>, string>;
export type ExpenseRow = Record<Cols<'Expenses'>, string>;

export const incomeSnapshot = cache(async () => {
  await ensure();
  const d = await store.read(['Income', 'Expenses']);
  const income = new Map<string, IncomeRow>();
  for (const r of shape('Income', d.Income ?? [])) income.set(`${r.house_id}|${r.code}`, r);
  const expenses = new Map<string, ExpenseRow>();
  for (const r of shape('Expenses', d.Expenses ?? [])) expenses.set(`${r.house_id}|${r.month}|${r.item}`, r);
  return {
    income: [...income.values()].filter((r) => r.removed !== '1'),
    expenses: [...expenses.values()].filter((r) => r.amount !== ''),
  };
});

export async function saveIncome(rows: Partial<IncomeRow>[], by: string) {
  await ensure();
  const at = new Date().toISOString();
  for (const r of rows) await store.append('Income', { ...r, saved_by: by, saved_at: at } as Record<string, string>);
}

export async function saveExpense(r: Pick<ExpenseRow, 'house_id' | 'month' | 'item' | 'amount'>, by: string) {
  await ensure();
  await store.append('Expenses', { ...r, saved_by: by, saved_at: new Date().toISOString() });
}
