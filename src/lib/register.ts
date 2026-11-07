import 'server-only';
import { listGuests, listHouses, type Guest } from './db';

export type RegisterFilter = { house?: string; from?: string; to?: string };

export async function registerRows(f: RegisterFilter): Promise<{ rows: Guest[]; houses: Awaited<ReturnType<typeof listHouses>> }> {
  const [guests, houses] = await Promise.all([listGuests(), listHouses()]);
  const rows = guests
    .filter((g) => (!f.house || g.house_id === f.house) && (!f.from || g.check_in >= f.from) && (!f.to || g.check_in <= f.to))
    .sort((a, b) => a.check_in.localeCompare(b.check_in) || a.token.localeCompare(b.token) || Number(a.guest_no) - Number(b.guest_no));
  return { rows, houses };
}

export const REGISTER_COLUMNS: [keyof Guest, string][] = [
  ['house_name', '施設 House'],
  ['check_in', 'チェックイン Check-in'],
  ['check_out', 'チェックアウト Check-out'],
  ['full_name', '氏名 Name'],
  ['address', '住所 Address'],
  ['occupation', '職業 Occupation'],
  ['nationality', '国籍 Nationality'],
  ['passport_no', '旅券番号 Passport no.'],
  ['phone', '電話 Phone'],
  ['passport_url', 'パスポート写し Passport copy'],
];
