import 'server-only';
import { randomBytes } from 'node:crypto';
import { gapi, sheetId } from './google';

// The Google Sheet is the database. Three tabs are created automatically on first use.
// You can edit the Houses tab directly in Google Sheets to rename houses or add more.
const TABS = {
  Houses: ['id', 'name', 'address', 'license_no'],
  Bookings: ['token', 'house_id', 'check_in', 'check_out', 'guests', 'lead_name', 'booking_ref', 'notes', 'created_at'],
  Guests: [
    'submitted_at', 'token', 'house_id', 'house_name', 'check_in', 'check_out', 'guest_no',
    'full_name', 'lives_in_japan', 'nationality', 'passport_no', 'address', 'occupation',
    'phone', 'email', 'passport_file_id', 'passport_url', 'lang',
  ],
} as const;

const SEED_HOUSES = [
  ['hayama', 'Hayama Retreat', '', ''],
  ['house2', 'House 2', '', ''],
];

export type House = { id: string; name: string; address: string; license_no: string };
export type Booking = {
  token: string; house_id: string; check_in: string; check_out: string; guests: number;
  lead_name: string; booking_ref: string; notes: string; created_at: string;
};
export type Guest = { [K in (typeof TABS.Guests)[number]]: string };

let ensured = false;
async function ensureTabs() {
  if (ensured) return;
  const { sheets } = gapi();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId(), fields: 'sheets.properties.title' });
  const existing = new Set(meta.data.sheets?.map((s) => s.properties?.title));
  const missing = (Object.keys(TABS) as (keyof typeof TABS)[]).filter((t) => !existing.has(t));
  if (missing.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) },
    });
    for (const t of missing) {
      const values: string[][] = [[...TABS[t]]];
      if (t === 'Houses') values.push(...SEED_HOUSES);
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId(), range: `${t}!A1`, valueInputOption: 'RAW', requestBody: { values },
      });
    }
  }
  ensured = true;
}

async function readTab<T extends keyof typeof TABS>(tab: T): Promise<Record<(typeof TABS)[T][number], string>[]> {
  await ensureTabs();
  const res = await gapi().sheets.spreadsheets.values.get({ spreadsheetId: sheetId(), range: `${tab}!A2:Z` });
  const cols = TABS[tab];
  return (res.data.values ?? [])
    .filter((r) => r.some((c) => String(c).trim()))
    .map((r) => Object.fromEntries(cols.map((c, i) => [c, String(r[i] ?? '').trim()])) as Record<(typeof TABS)[T][number], string>);
}

async function appendRow<T extends keyof typeof TABS>(tab: T, row: Partial<Record<(typeof TABS)[T][number], string | number>>) {
  await ensureTabs();
  const values = [TABS[tab].map((c) => String((row as Record<string, unknown>)[c] ?? ''))];
  // RAW so guest input like "=..." is never treated as a formula.
  await gapi().sheets.spreadsheets.values.append({
    spreadsheetId: sheetId(), range: `${tab}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

export async function listHouses(): Promise<House[]> {
  return readTab('Houses');
}

export async function listBookings(): Promise<Booking[]> {
  const rows = await readTab('Bookings');
  return rows.map((r) => ({ ...r, guests: Number(r.guests) || 1 }));
}

export async function getBooking(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return (await listBookings()).find((b) => b.token === token) ?? null;
}

export async function createBooking(b: Omit<Booking, 'token' | 'created_at'>) {
  const token = randomBytes(16).toString('base64url');
  await appendRow('Bookings', { ...b, token, created_at: new Date().toISOString() });
  return token;
}

export async function listGuests(): Promise<Guest[]> {
  return readTab('Guests');
}

export async function guestsForBooking(token: string) {
  return (await listGuests()).filter((g) => g.token === token);
}

export async function addGuest(g: Partial<Guest>) {
  await appendRow('Guests', { ...g, submitted_at: new Date().toISOString() });
}

// Links stay open until 7 days after check-out.
export function isExpired(b: Booking) {
  const end = new Date(`${b.check_out}T23:59:59+09:00`);
  return Date.now() > end.getTime() + 7 * 86400_000;
}
