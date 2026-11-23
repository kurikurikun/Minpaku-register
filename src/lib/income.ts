import type { ExpenseRow, House, IncomeRow } from './db';

export const EXPENSE_ITEMS = ['Gas', 'Power', 'Internet', 'Water', 'Accommodation tax', 'Other'] as const;
// Things the manager paid for, reimbursed on top of their payment (stored as item "manager:<label>").
export const MANAGER_PREFIX = 'manager:';

export const yen = (n: number) => `¥${Math.round(n).toLocaleString('en-US')}`;
export const num = (v: string | number | undefined) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export type Payout = { name: string; pct: number; share: number; cleanings: number; cleaningTotal: number; reimburse: number; total: number; remainder?: boolean };

// Who gets a share of net income C. Either the `shares` column ("Ai:20, Khaing:40, Owner:40"),
// or the older manager_name + manager_pct with the rest going to "You".
function splitFor(house: House | undefined) {
  const parsed = (house?.shares ?? '')
    .split(/[,、]/)
    .map((p) => p.trim().match(/^(.+?)\s*[:：]\s*([\d.]+)\s*%?$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ name: m[1].trim(), pct: Number(m[2]) }));
  if (parsed.length) return { people: parsed, fromShares: true };
  if (house?.manager_name) return { people: [{ name: house.manager_name, pct: num(house.manager_pct) }], fromShares: false };
  return { people: [] as { name: string; pct: number }[], fromShares: false };
}

export function cleanersFor(house: House | undefined) {
  const list = (house?.cleaners ?? '').split(/[,、]/).map((c) => c.trim()).filter(Boolean);
  return list.length ? list : house?.manager_name ? [house.manager_name] : [];
}

// A = sum of (payout - cleaning fee) per stay, B = expenses (+ accommodation tax), C = A - B.
// Each stay's cleaning fee goes to whoever cleaned it. C is split by percentage.
// Manager purchases are paid back to the manager. With a `shares` split they also come off
// before the split (everyone shares the cost); with the older manager setup the remainder ("You")
// pays for them, as in the original Hiroshima spreadsheet.
export function statement(house: House | undefined, stays: IncomeRow[], allExpenses: ExpenseRow[]) {
  const expenses = allExpenses.filter((e) => !e.item.startsWith(MANAGER_PREFIX));
  const reimburse = allExpenses.filter((e) => e.item.startsWith(MANAGER_PREFIX)).map((e) => ({ ...e, label: e.item.slice(MANAGER_PREFIX.length), value: num(e.amount) }));
  const reimburseTotal = reimburse.reduce((t, e) => t + e.value, 0);
  const cleaning = num(house?.cleaning_fee);
  const taxRate = num(house?.tax_per_night);
  const taxMin = num(house?.tax_min_price);
  const taxFrom = house?.tax_from ?? '';
  const { people: split, fromShares } = splitFor(house);
  const cleaners = cleanersFor(house);
  const manager = house?.manager_name || split[0]?.name || '';
  const rows = stays
    .slice()
    .sort((a, b) => a.check_in.localeCompare(b.check_in))
    .map((s) => {
      const incl = num(s.amount);
      const people = num(s.people);
      const nights = num(s.nights);
      const personNights = people * nights;
      // Accommodation tax: per person-night, only if the price per person-night reaches the threshold.
      // A tax typed in by hand (occupancy_tax) overrides the calculation.
      let taxable = 0;
      if (taxRate && personNights && (!taxFrom || s.check_in >= taxFrom) && incl / personNights >= taxMin) taxable = personNights;
      const auto = taxable * taxRate;
      const tax = s.occupancy_tax !== '' && s.occupancy_tax !== undefined ? num(s.occupancy_tax) : auto;
      return {
        ...s, incl, excl: incl - cleaning, people, nights, personNights, exempt: personNights - taxable, tax,
        taxAuto: s.occupancy_tax === '' || s.occupancy_tax === undefined,
        cleanedBy: s.cleaner || cleaners[0] || '',
      };
    });
  const A = rows.reduce((t, r) => t + r.excl, 0);
  const taxTotal = rows.reduce((t, r) => t + r.tax, 0);
  // With an automatic tax rate, the calculated tax replaces the hand-entered "Accommodation tax" line.
  const B =
    expenses.filter((e) => !(taxRate && e.item === 'Accommodation tax')).reduce((t, e) => t + num(e.amount), 0) +
    (taxRate ? taxTotal : 0) +
    (fromShares ? reimburseTotal : 0);
  const C = A - B;

  const names = [...new Set([...split.map((p) => p.name), ...rows.map((r) => r.cleanedBy).filter(Boolean), ...(reimburseTotal && manager ? [manager] : [])])];
  const payouts: Payout[] = names.map((name) => {
    const pct = split.find((p) => p.name === name)?.pct ?? 0;
    const cleanings = rows.filter((r) => r.cleanedBy === name).length;
    const back = name === manager ? reimburseTotal : 0;
    const share = (C * pct) / 100;
    return { name, pct, share, cleanings, cleaningTotal: cleanings * cleaning, reimburse: back, total: share + cleanings * cleaning + back };
  });
  const restPct = 100 - split.reduce((t, p) => t + p.pct, 0);
  if (split.length && restPct > 0.0001) {
    const share = (C * restPct) / 100;
    const total = share - (fromShares ? 0 : reimburseTotal);
    payouts.push({ name: 'You', pct: restPct, share, cleanings: 0, cleaningTotal: 0, reimburse: fromShares ? 0 : -reimburseTotal, total, remainder: true });
  }

  return {
    rows, A, B, C, cleaning, taxRate, taxMin, taxTotal, reimburse, reimburseTotal, manager, cleaners, fromShares, payouts,
    nights: rows.reduce((t, r) => t + r.nights, 0),
    personNights: rows.reduce((t, r) => t + r.personNights, 0),
  };
}
