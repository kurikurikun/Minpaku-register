import 'server-only';
import type { House, IncomeRow } from './db';
import { num, statement } from './income';

export type TaxDay = { day: number; taxable: number; nonTaxable: number; under6000: number; school: number; total: number };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Guests per night for each day of the month, split taxable / not taxable (under ¥6,000 per
// person-night). Nights are counted on the date they fall on, so a stay over a month end is
// split between the two months, as the 月計表 asks.
export function taxReport(house: House, allStays: IncomeRow[], month: string) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days: TaxDay[] = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, taxable: 0, nonTaxable: 0, under6000: 0, school: 0, total: 0 }));
  const first = `${month}-01`, last = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const rate = num(house.tax_per_night);
  const missingPeople: { guest: string; check_in: string; code: string }[] = [];

  // Tax per stay comes from the same calculation as the Income page.
  const relevant = allStays.filter((s) => s.house_id === house.id && s.check_in <= last && (s.check_out || addDays(s.check_in, num(s.nights))) > first);
  const rows = statement(house, relevant, []).rows;
  for (const r of rows) {
    const nights = r.nights || 0;
    if (!r.people || !nights) { missingPeople.push(r); continue; }
    // A tax typed in by hand decides how many guests per night are taxable.
    const taxablePerNight = rate ? Math.min(r.people, Math.round(r.tax / (rate * nights))) : 0;
    for (let i = 0; i < nights; i++) {
      const date = addDays(r.check_in, i);
      if (date < first || date > last) continue;
      const d = days[Number(date.slice(8, 10)) - 1];
      d.taxable += taxablePerNight;
      d.under6000 += r.people - taxablePerNight;
      d.nonTaxable += r.people - taxablePerNight;
      d.total += r.people;
    }
  }
  const sum = (k: keyof TaxDay) => days.reduce((t, d) => t + (d[k] as number), 0);
  const totals = { taxable: sum('taxable'), nonTaxable: sum('nonTaxable'), under6000: sum('under6000'), school: sum('school'), total: sum('total') };
  return { days, totals, tax: totals.taxable * rate, rate, missingPeople, reiwa: y - 2018, monthNum: m };
}
