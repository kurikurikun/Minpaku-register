import type { ExpenseRow, House, IncomeRow } from './db';

export const EXPENSE_ITEMS = ['Gas', 'Power', 'Internet', 'Water', 'Accommodation tax', 'Other'] as const;
// Things the manager paid for, reimbursed on top of their payment (stored as item "manager:<label>").
export const MANAGER_PREFIX = 'manager:';

export const yen = (n: number) => `¥${Math.round(n).toLocaleString('en-US')}`;
export const num = (v: string | number | undefined) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Same calculation as the monthly spreadsheet:
// A = sum of (payout - cleaning fee) per stay, B = expenses, C = A - B,
// manager gets their expenses back + cleaning fee x stays + pct% of C.
export function statement(house: House | undefined, stays: IncomeRow[], allExpenses: ExpenseRow[]) {
  const expenses = allExpenses.filter((e) => !e.item.startsWith(MANAGER_PREFIX));
  const reimburse = allExpenses.filter((e) => e.item.startsWith(MANAGER_PREFIX)).map((e) => ({ ...e, label: e.item.slice(MANAGER_PREFIX.length), value: num(e.amount) }));
  const reimburseTotal = reimburse.reduce((t, e) => t + e.value, 0);
  const cleaning = num(house?.cleaning_fee);
  const pct = num(house?.manager_pct);
  const taxRate = num(house?.tax_per_night);
  const taxMin = num(house?.tax_min_price);
  const taxFrom = house?.tax_from ?? '';
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
      return { ...s, incl, excl: incl - cleaning, people, nights, personNights, exempt: personNights - taxable, tax, taxAuto: s.occupancy_tax === '' || s.occupancy_tax === undefined };
    });
  const A = rows.reduce((t, r) => t + r.excl, 0);
  const taxTotal = rows.reduce((t, r) => t + r.tax, 0);
  // With an automatic tax rate, the calculated tax replaces the hand-entered "Accommodation tax" line.
  const B = expenses.filter((e) => !(taxRate && e.item === 'Accommodation tax')).reduce((t, e) => t + num(e.amount), 0) + (taxRate ? taxTotal : 0);
  const C = A - B;
  const cleaningTotal = cleaning * rows.length;
  const share = (C * pct) / 100;
  return {
    rows, A, B, C, cleaning, pct, taxRate, taxMin, taxTotal, cleaningTotal, share, reimburse, reimburseTotal,
    managerTotal: reimburseTotal + cleaningTotal + share,
    ownerTotal: C - share - reimburseTotal,
    nights: rows.reduce((t, r) => t + r.nights, 0),
    personNights: rows.reduce((t, r) => t + r.personNights, 0),
  };
}
