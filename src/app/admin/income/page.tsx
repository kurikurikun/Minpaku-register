import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { incomeSnapshot, listBookings, listGuests, listHouses } from '@/lib/db';
import { EXPENSE_ITEMS, MANAGER_PREFIX, num, statement, yen } from '@/lib/income';
import AdminNav from '@/components/AdminNav';
import PrintButton from '@/components/PrintButton';
import { addManagerExpense, addStay, removeExpense, saveExpenses, updateStay } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default async function IncomePage({ searchParams }: { searchParams: { house?: string; month?: string; saved?: string } }) {
  const admin = requireAdmin();
  if (!admin.houses.includes('*')) redirect('/admin');

  const [houses, data, bookings, guests] = await Promise.all([listHouses(), incomeSnapshot(), listBookings(), listGuests()]);
  const jstNow = new Date(Date.now() + 9 * 3600_000);
  const houseId = searchParams.house && houses.some((h) => h.id === searchParams.house) ? searchParams.house : houses.find((h) => h.manager_name)?.id ?? houses[0]?.id;
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : jstNow.toISOString().slice(0, 7);
  const house = houses.find((h) => h.id === houseId);
  const manager = house?.manager_name || 'Manager';

  // Registered guest counts by Airbnb code, used when a stay has no people count yet.
  const registered = new Map<string, number>();
  for (const b of bookings) if (b.booking_ref) registered.set(b.booking_ref, guests.filter((g) => g.token === b.token).length);

  const forMonth = (m: string) => ({
    stays: data.income.filter((r) => r.house_id === houseId && r.month === m).map((r) => ({ ...r, people: r.people || String(registered.get(r.code) || '') })),
    expenses: data.expenses.filter((e) => e.house_id === houseId && e.month === m),
  });
  const cur = forMonth(month);
  const st = statement(house, cur.stays, cur.expenses);
  const expenseValue = (item: string) => cur.expenses.find((e) => e.item === item)?.amount ?? '';

  const year = month.slice(0, 4);
  const yearRows = MONTHS.map((label, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const f = forMonth(m);
    const s = statement(house, f.stays, f.expenses);
    return { label, m, has: f.stays.length > 0 || f.expenses.length > 0, ...s };
  });
  const active = yearRows.filter((r) => r.has);
  const sum = (k: 'managerTotal' | 'C' | 'ownerTotal') => active.reduce((t, r) => t + r[k], 0);
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const q = (m: string) => `/admin/income?house=${houseId}&month=${m}`;
  const shift = (d: number) => {
    const dt = new Date(`${month}-01T00:00:00Z`);
    dt.setUTCMonth(dt.getUTCMonth() + d);
    return dt.toISOString().slice(0, 7);
  };

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <form className="no-print card grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label>
            <span className="label">House</span>
            <select name="house" defaultValue={houseId} className="input">
              {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Month</span>
            <input type="month" name="month" defaultValue={month} className="input" />
          </label>
          <button className="btn">Show</button>
        </form>

        {searchParams.saved && <p className="glass rounded-2xl p-3">Saved {searchParams.saved} stay{searchParams.saved === '1' ? '' : 's'}.</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Link href={q(shift(-1))} className="btn-ghost no-print px-4 py-2 text-sm">←</Link>
          <h1 className="text-2xl font-semibold">{house?.name} · {monthLabel}</h1>
          <Link href={q(shift(1))} className="btn-ghost no-print px-4 py-2 text-sm">→</Link>
          <div className="no-print ml-auto flex gap-2">
            <Link href={`/admin/income/upload?house=${houseId}`} className="btn">Upload Airbnb CSV</Link>
            <PrintButton />
          </div>
        </div>

        {/* Stays */}
        <section className="card">
          <h2 className="mb-1 text-lg font-semibold">Accommodation income</h2>
          <p className="mb-3 text-sm text-neutral-500">
            Payout per stay from Airbnb{st.cleaning ? `, minus ${yen(st.cleaning)} cleaning` : ''}. Stays are counted in the month they check in.
            {st.taxRate > 0 && ` Tax: ${yen(st.taxRate)} per person-night when the payout is ${yen(st.taxMin)}+ per person-night (blank people count = no tax worked out; * = typed in by hand).`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-2 pr-2 font-medium">Guest</th>
                  <th className="py-2 pr-2 font-medium">Dates</th>
                  <th className="py-2 pr-2 text-right font-medium">Not incl. cleaning</th>
                  <th className="py-2 pr-2 text-right font-medium">Incl. cleaning</th>
                  <th className="py-2 pr-2 text-right font-medium">People</th>
                  <th className="py-2 pr-2 text-right font-medium">Nights</th>
                  <th className="py-2 pr-2 text-right font-medium">Tax</th>
                  <th className="py-2 pr-2 text-right font-medium">宿泊数</th>
                  <th className="py-2 pr-2 text-right font-medium">免除</th>
                  <th className="no-print" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {st.rows.map((r) => (
                  <tr key={r.code} className="align-top">
                    <td className="py-2 pr-2">{r.guest || '—'}<div className="text-xs text-neutral-500">{r.code.startsWith('manual-') ? 'added by hand' : r.code}</div></td>
                    <td className="py-2 pr-2 whitespace-nowrap">{r.check_in.slice(5).replace('-', '/')} → {r.check_out.slice(5).replace('-', '/')}</td>
                    <td className="py-2 pr-2 text-right">{yen(r.excl)}</td>
                    <td className="py-2 pr-2 text-right">{yen(r.incl)}</td>
                    <td className="py-2 pr-2 text-right">{r.people || <span className="text-neutral-400">?</span>}</td>
                    <td className="py-2 pr-2 text-right">{r.nights}</td>
                    <td className="py-2 pr-2 text-right">{r.tax ? yen(r.tax) : 0}{!r.taxAuto && <span className="text-neutral-400">*</span>}</td>
                    <td className="py-2 pr-2 text-right">{r.personNights || ''}</td>
                    <td className="py-2 pr-2 text-right">{r.personNights ? r.exempt : ''}</td>
                    <td className="no-print py-2 text-right">
                      <details className="relative inline-block text-left">
                        <summary className="cursor-pointer list-none text-xs text-neutral-500 underline">Edit</summary>
                        <form action={updateStay} className="glass absolute right-0 z-10 mt-2 grid w-64 gap-2 rounded-2xl p-3">
                          {(['house_id', 'code', 'check_in', 'check_out'] as const).map((k) => <input key={k} type="hidden" name={k} value={r[k]} />)}
                          <label className="text-xs">Guest<input name="guest" defaultValue={r.guest} className="input mt-1 py-2" /></label>
                          <label className="text-xs">Payout incl. cleaning (¥)<input name="amount" defaultValue={r.amount} inputMode="numeric" className="input mt-1 py-2" /></label>
                          <div className="grid grid-cols-3 gap-2">
                            <label className="text-xs">People<input name="people" defaultValue={r.people || ''} inputMode="numeric" className="input mt-1 py-2" /></label>
                            <label className="text-xs">Nights<input name="nights" defaultValue={r.nights} inputMode="numeric" className="input mt-1 py-2" /></label>
                            <label className="text-xs">Tax<input name="occupancy_tax" defaultValue={r.occupancy_tax} inputMode="numeric" className="input mt-1 py-2" /></label>
                          </div>
                          <div className="flex gap-2">
                            <button className="btn flex-1 py-2 text-sm">Save</button>
                            <button name="remove" value="1" className="btn-ghost py-2 text-sm">Remove</button>
                          </div>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
                {st.rows.length === 0 && (
                  <tr><td colSpan={10} className="py-4 text-neutral-500">No stays yet. Upload the Airbnb CSV or add one below.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2 pr-2" colSpan={2}>Accom total (A)</td>
                  <td className="py-2 pr-2 text-right">{yen(st.A)}</td>
                  <td colSpan={2} />
                  <td className="py-2 pr-2 text-right">{st.nights}</td>
                  <td className="py-2 pr-2 text-right">{st.taxTotal ? yen(st.taxTotal) : 0}</td>
                  <td className="py-2 pr-2 text-right">{st.personNights || ''}</td>
                  <td />
                  <td className="no-print" />
                </tr>
              </tfoot>
            </table>
          </div>
          <details className="no-print mt-3">
            <summary className="cursor-pointer text-sm text-neutral-600 underline">Add a stay by hand</summary>
            <form action={addStay} className="mt-3 grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="house" value={houseId} />
              <input name="guest" placeholder="Guest" className="input sm:col-span-2" />
              <input name="amount" placeholder="Payout incl. cleaning" inputMode="numeric" className="input sm:col-span-2" required />
              <label className="text-xs">Check-in<input name="check_in" type="date" defaultValue={`${month}-01`} className="input mt-1" required /></label>
              <label className="text-xs">Check-out<input name="check_out" type="date" className="input mt-1" /></label>
              <label className="text-xs">Nights<input name="nights" inputMode="numeric" className="input mt-1" /></label>
              <label className="text-xs">People<input name="people" inputMode="numeric" className="input mt-1" /></label>
              <button className="btn sm:col-span-4">Add stay</button>
            </form>
          </details>
        </section>

        {/* Expenses */}
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">Utilities & expenses</h2>
          <form action={saveExpenses} className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <input type="hidden" name="house" value={houseId} />
            <input type="hidden" name="month" value={month} />
            {EXPENSE_ITEMS.filter((item) => !(st.taxRate && item === 'Accommodation tax')).map((item) => (
              <label key={item} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm">{item}{item === 'Water' && <span className="text-neutral-400"> (every 2 mo.)</span>}</span>
                <input type="hidden" name={`${item}__before`} value={expenseValue(item)} />
                <input name={item} defaultValue={expenseValue(item)} inputMode="numeric" placeholder="¥0" className="input py-2" />
              </label>
            ))}
            {st.taxRate > 0 && (
              <div className="flex items-center gap-3 sm:col-span-2">
                <span className="w-36 shrink-0 text-sm">Accommodation tax</span>
                <span className="text-sm">{yen(st.taxTotal)} <span className="text-neutral-500">(worked out from the stays above)</span></span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 sm:col-span-2">
              <span className="font-semibold">Utilities total (B): {yen(st.B)}</span>
              <button className="btn-ghost no-print py-2 text-sm">Save expenses</button>
            </div>
          </form>
          <div className="mt-4 rounded-2xl bg-black/90 p-4 text-white">
            <div className="text-sm text-white/70">A − B = net income C</div>
            <div className="text-2xl font-semibold">{yen(st.C)}</div>
          </div>
        </section>

        {/* Manager */}
        {(house?.manager_name || st.pct > 0) && (
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">{manager} payment</h2>
            <div className="mb-4">
              <div className="label">{manager}&apos;s expenses (reimbursed)</div>
              <ul className="divide-y divide-black/5 text-sm">
                {st.reimburse.map((e) => (
                  <li key={e.item} className="flex items-center gap-3 py-1.5">
                    <span className="flex-1">{e.label}</span>
                    <span>{yen(e.value)}</span>
                    <form action={removeExpense} className="no-print">
                      <input type="hidden" name="house" value={houseId} />
                      <input type="hidden" name="month" value={month} />
                      <input type="hidden" name="item" value={e.item} />
                      <button className="text-xs text-neutral-500 underline">remove</button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={addManagerExpense} className="no-print mt-2 flex gap-2">
                <input type="hidden" name="house" value={houseId} />
                <input type="hidden" name="month" value={month} />
                <input name="label" placeholder="e.g. cleaning supplies" className="input flex-1 py-2" required />
                <input name="amount" placeholder="¥" inputMode="numeric" className="input w-28 py-2" required />
                <button className="btn-ghost py-2 text-sm">Add</button>
              </form>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
              {st.reimburseTotal > 0 && <><dt>Expenses</dt><dd className="text-right">{yen(st.reimburseTotal)}</dd></>}
              <dt>Cleaning × {st.rows.length}{st.cleaning ? ` (${yen(st.cleaning)} each)` : ''}</dt><dd className="text-right">{yen(st.cleaningTotal)}</dd>
              <dt>{st.pct}% of net income C</dt><dd className="text-right">{yen(st.share)}</dd>
              <dt className="border-t border-black/10 pt-2 text-base font-semibold">Total to {manager}</dt>
              <dd className="border-t border-black/10 pt-2 text-right text-base font-semibold">{yen(st.managerTotal)}</dd>
              <dt className="text-neutral-500">You keep (C − {st.pct}%{st.reimburseTotal ? ' − expenses' : ''})</dt>
              <dd className="text-right text-neutral-500">{yen(st.ownerTotal)}</dd>
            </dl>
            {!house?.cleaning_fee && (
              <p className="mt-3 text-xs text-neutral-500">Set cleaning_fee, manager_name and manager_pct for this house in the Houses tab.</p>
            )}
          </section>
        )}

        {/* Year */}
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{year} by month</h2>
          <table className="w-full text-sm">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-1.5 text-left font-medium">Month</th>
                <th className="py-1.5 text-right font-medium">Stays</th>
                <th className="py-1.5 text-right font-medium">Net income C</th>
                {house?.manager_name && <th className="py-1.5 text-right font-medium">{manager}</th>}
                <th className="py-1.5 text-right font-medium">You keep</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {yearRows.map((r) => (
                <tr key={r.m} className={r.m === month ? 'font-semibold' : r.has ? '' : 'text-neutral-400'}>
                  <td className="py-1.5"><Link href={q(r.m)} className="hover:underline">{r.label}</Link></td>
                  <td className="py-1.5 text-right">{r.has ? r.rows.length : ''}</td>
                  <td className="py-1.5 text-right">{r.has ? yen(r.C) : ''}</td>
                  {house?.manager_name && <td className="py-1.5 text-right">{r.has ? yen(r.managerTotal) : ''}</td>}
                  <td className="py-1.5 text-right">{r.has ? yen(r.ownerTotal) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <tr className="border-t border-black/10">
                <td className="py-1.5">Total</td><td />
                <td className="py-1.5 text-right">{yen(sum('C'))}</td>
                {house?.manager_name && <td className="py-1.5 text-right">{yen(sum('managerTotal'))}</td>}
                <td className="py-1.5 text-right">{yen(sum('ownerTotal'))}</td>
              </tr>
              <tr className="text-neutral-500">
                <td className="py-1.5">Monthly avg</td><td />
                <td className="py-1.5 text-right">{active.length ? yen(sum('C') / active.length) : ''}</td>
                {house?.manager_name && <td className="py-1.5 text-right">{active.length ? yen(sum('managerTotal') / active.length) : ''}</td>}
                <td className="py-1.5 text-right">{active.length ? yen(sum('ownerTotal') / active.length) : ''}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      </main>
    </>
  );
}
