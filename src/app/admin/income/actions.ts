'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { incomeSnapshot, saveExpense, saveIncome, type IncomeRow } from '@/lib/db';
import { EXPENSE_ITEMS, MANAGER_PREFIX } from '@/lib/income';

function requireIncome() {
  const admin = requireAdmin();
  if (!admin.houses.includes('*')) redirect('/admin');
  return admin;
}

const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const isMonth = (m: string) => /^\d{4}-\d{2}$/.test(m);

async function inBatches<T>(items: T[], fn: (x: T) => Promise<unknown>, size = 5) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

export type UploadRow = Pick<IncomeRow, 'code' | 'guest' | 'check_in' | 'check_out' | 'nights' | 'people' | 'amount' | 'occupancy_tax'>;

export async function importStays(house: string, rows: UploadRow[]) {
  const admin = requireIncome();
  const valid = rows
    .map((r) => ({
      house_id: clean(house, 40),
      code: clean(r.code, 40) || `manual-${randomBytes(4).toString('hex')}`,
      guest: clean(r.guest, 120),
      check_in: clean(r.check_in, 10),
      check_out: clean(r.check_out, 10),
      nights: clean(r.nights, 4),
      people: clean(r.people, 4),
      amount: clean(r.amount, 12),
      occupancy_tax: clean(r.occupancy_tax, 12),
    }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.check_in))
    .map((r) => ({ ...r, month: r.check_in.slice(0, 7), removed: '', cleaner: '' }));
  // Keep changes made by hand on the Income page: removed stays stay removed,
  // and a typed-in tax or a chosen cleaner is carried over.
  const { latest } = await incomeSnapshot();
  const toSave = valid
    .map((r) => {
      const prev = latest.get(`${r.house_id}|${r.code}`);
      if (!prev) return r;
      if (prev.removed === '1') return null;
      return { ...r, occupancy_tax: prev.occupancy_tax || r.occupancy_tax, cleaner: prev.cleaner || '' };
    })
    .filter((r): r is NonNullable<typeof r> => !!r);
  await inBatches(toSave, (r) => saveIncome([r], admin.user));
  const month = valid[0]?.month ?? '';
  redirect(`/admin/income?house=${encodeURIComponent(house)}${month ? `&month=${month}` : ''}&saved=${toSave.length}`);
}

export async function addStay(fd: FormData) {
  const house = clean(fd.get('house'));
  await importStays(house, [{
    code: '', guest: clean(fd.get('guest')), check_in: clean(fd.get('check_in')), check_out: clean(fd.get('check_out')),
    nights: clean(fd.get('nights')), people: clean(fd.get('people')), amount: clean(fd.get('amount')), occupancy_tax: '',
  }]);
}

export async function updateStay(fd: FormData) {
  const admin = requireIncome();
  const r = Object.fromEntries(['house_id', 'code', 'guest', 'check_in', 'check_out', 'nights', 'people', 'amount', 'occupancy_tax', 'cleaner'].map((k) => [k, clean(fd.get(k))]));
  const remove = fd.get('remove') === '1';
  await saveIncome([{ ...r, month: r.check_in.slice(0, 7), removed: remove ? '1' : '' }], admin.user);
  redirect(`/admin/income?house=${encodeURIComponent(r.house_id)}&month=${r.check_in.slice(0, 7)}`);
}

export async function saveExpenses(fd: FormData) {
  const admin = requireIncome();
  const house = clean(fd.get('house'), 40);
  const month = clean(fd.get('month'), 7);
  if (!isMonth(month)) redirect('/admin/income');
  const changed = EXPENSE_ITEMS.map((item) => ({ item, amount: clean(fd.get(item), 12), before: clean(fd.get(`${item}__before`), 12) }))
    .filter((e) => e.amount !== e.before);
  await inBatches(changed, (e) => saveExpense({ house_id: house, month, item: e.item, amount: e.amount }, admin.user));
  redirect(`/admin/income?house=${encodeURIComponent(house)}&month=${month}`);
}

export async function addManagerExpense(fd: FormData) {
  const admin = requireIncome();
  const house = clean(fd.get('house'), 40);
  const month = clean(fd.get('month'), 7);
  const label = clean(fd.get('label'), 60);
  const amount = clean(fd.get('amount'), 12);
  if (isMonth(month) && label && amount) await saveExpense({ house_id: house, month, item: MANAGER_PREFIX + label, amount }, admin.user);
  redirect(`/admin/income?house=${encodeURIComponent(house)}&month=${month}`);
}

export async function removeExpense(fd: FormData) {
  const admin = requireIncome();
  const house = clean(fd.get('house'), 40);
  const month = clean(fd.get('month'), 7);
  await saveExpense({ house_id: house, month, item: clean(fd.get('item'), 80), amount: '' }, admin.user);
  redirect(`/admin/income?house=${encodeURIComponent(house)}&month=${month}`);
}

// Bank statement import: set several monthly expense lines at once.
export async function importExpenses(house: string, rows: { month: string; item: string; amount: number }[]) {
  const admin = requireIncome();
  const allowed = new Set<string>(EXPENSE_ITEMS);
  const valid = rows
    .filter((r) => isMonth(r.month) && allowed.has(r.item) && Number.isFinite(r.amount))
    .map((r) => ({ house_id: clean(house, 40), month: r.month, item: r.item, amount: String(Math.round(r.amount)) }));
  await inBatches(valid, (r) => saveExpense(r, admin.user));
  const month = valid[0]?.month ?? '';
  redirect(`/admin/income?house=${encodeURIComponent(house)}${month ? `&month=${month}` : ''}`);
}
