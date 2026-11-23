import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { incomeSnapshot, listBookings, listGuests, listHouses } from '@/lib/db';
import { EXPENSE_ITEMS, MANAGER_PREFIX, num, statement, yen } from '@/lib/income';
import AdminNav from '@/components/AdminNav';
import PrintButton from '@/components/PrintButton';
import IncomeChart from '@/components/IncomeChart';
import { addManagerExpense, addStay, removeExpense, saveExpenses, updateStay } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default async function IncomePage({ searchParams }: { searchParams: { house?: string; month?: string; saved?: string; edit?: string } }) {
  const admin = requireAdmin();
  if (!admin.houses.includes('*')) redirect('/admin');

  const [houses, data, bookings, guests] = await Promise.all([listHouses(), incomeSnapshot(), listBookings(), listGuests()]);
  const jstNow = new Date(Date.now() + 9 * 3600_000);
  const houseId = searchParams.house && houses.some((h) => h.id === searchParams.house) ? searchParams.house : houses.find((h) => h.manager_name)?.id ?? houses[0]?.id;
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : jstNow.toISOString().slice(0, 7);
  const house = houses.find((h) => h.id === houseId);

  // Registered guest counts by Airbnb code, used when a stay has no people count yet.
  const registered = new Map<string, number>();
  for (const b of bookings) if (b.booking_ref) registered.set(b.booking_ref, guests.filter((g) => g.token === b.token).length);

  const forMonth = (m: string) => ({
    stays: data.income.filter((r) => r.house_id === houseId && r.month === m).map((r) => ({ ...r, people: r.people || String(registered.get(r.code) || '') })),
    expenses: data.expenses.filter((e) => e.house_id === houseId && e.month === m),
  });
  const cur = forMonth(month);
  const st = statement(house, cur.stays, cur.expenses);
  const editing = searchParams.edit ? st.rows.find((r) => r.code === searchParams.edit) : undefined;
  const expenseValue = (item: string) => cur.expenses.find((e) => e.item === item)?.amount ?? '';

  const year = month.slice(0, 4);
  const yearRows = MONTHS.map((label, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const f = forMonth(m);
    const s = statement(house, f.stays, f.expenses);
    return { label, m, has: f.stays.length > 0 || f.expenses.length > 0, ...s };
  });
  const active = yearRows.filter((r) => r.has);
  const sumC = active.reduce((t, r) => t + r.C, 0);
  // Everyone who is paid from this house this year, in a stable order.
  const payees = [...new Set([...st.payouts.map((p) => p.name), ...yearRows.flatMap((r) => r.payouts.map((p) => p.name))])];
  const paid = (r: (typeof yearRows)[number], name: string) => r.payouts.find((p) => p.name === name)?.total ?? 0;
  const sumPaid = (name: string) => active.reduce((t, r) => t + paid(r, name), 0);
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
                  {st.cleaners.length > 0 && <th className="py-2 pr-2 font-medium">Cleaned by</th>}
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
                    {st.cleaners.length > 0 && <td className="py-2 pr-2">{r.cleanedBy}</td>}
                    <td className="no-print py-2 text-right">
                      <Link href={`${q(month)}&edit=${encodeURIComponent(r.code)}#edit`} className="text-xs text-neutral-500 underline">Edit</Link>
                    </td>
                  </tr>
                ))}
                {st.rows.length === 0 && (
                  <tr><td colSpan={11} className="py-4 text-neutral-500">No stays yet. Upload the Airbnb CSV or add one below.</td></tr>
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
                  {st.cleaners.length > 0 && <td />}
                  <td className="no-print" />
                </tr>
              </tfoot>
            </table>
          </div>
          {editing && (
            <form id="edit" action={updateStay} className="no-print mt-4 grid scroll-mt-32 gap-3 rounded-3xl bg-white/60 p-4 ring-1 ring-white/80 sm:grid-cols-4">
              <div className="flex items-center justify-between sm:col-span-4">
                <span className="font-semibold">Edit stay · {editing.check_in.slice(5).replace('-', '/')} → {editing.check_out.slice(5).replace('-', '/')}</span>
                <Link href={q(month)} className="text-sm text-neutral-500 underline">Cancel</Link>
              </div>
              {(['house_id', 'code', 'check_in', 'check_out'] as const).map((k) => <input key={k} type="hidden" name={k} value={editing[k]} />)}
              <label className="text-xs sm:col-span-2">Guest<input name="guest" defaultValue={editing.guest} className="input mt-1" /></label>
              <label className="text-xs sm:col-span-2">Payout incl. cleaning (¥)<input name="amount" defaultValue={editing.amount} inputMode="numeric" className="input mt-1" /></label>
              <label className="text-xs">People<input name="people" defaultValue={editing.people || ''} inputMode="numeric" className="input mt-1" /></label>
              <label className="text-xs">Nights<input name="nights" defaultValue={editing.nights} inputMode="numeric" className="input mt-1" /></label>
              <label className="text-xs">Tax (blank = automatic)<input name="occupancy_tax" defaultValue={editing.occupancy_tax} inputMode="numeric" className="input mt-1" /></label>
              {st.cleaners.length > 0 ? (
                <label className="text-xs">Cleaned by
                  <select name="cleaner" defaultValue={editing.cleanedBy} className="input mt-1">
                    {st.cleaners.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              ) : <div />}
              <div className="flex gap-2 sm:col-span-4">
                <button className="btn flex-1">Save</button>
                <button name="remove" value="1" className="btn-ghost">Remove stay</button>
              </div>
            </form>
          )}
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
              <span className="font-semibold">Utilities total (B): {yen(st.B)}{st.fromShares && st.reimburseTotal > 0 && <span className="font-normal text-neutral-500"> (incl. {yen(st.reimburseTotal)} {st.manager} paid for)</span>}</span>
              <button className="btn-ghost no-print py-2 text-sm">Save expenses</button>
            </div>
          </form>
          <div className="mt-4 rounded-2xl bg-black/90 p-4 text-white">
            <div className="text-sm text-white/70">A − B = net income C</div>
            <div className="text-2xl font-semibold">{yen(st.C)}</div>
          </div>
        </section>

        {/* Payments */}
        {st.payouts.length > 0 && (
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">Payments</h2>
            {st.manager && (
              <div className="mb-5">
                <div className="label">Things {st.manager} paid for (paid back{st.fromShares ? ', shared by everyone' : ''})</div>
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
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {st.payouts.map((p) => (
                <div key={p.name} className={`rounded-3xl p-4 ring-1 ${p.remainder ? 'bg-white/30 ring-white/60' : 'bg-white/50 ring-white/80'}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">{p.remainder ? 'You keep' : p.name}</span>
                    <span className="text-lg font-semibold">{yen(p.total)}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-sm text-neutral-600">
                    {p.pct > 0 && <><dt>{p.pct}% of net income C</dt><dd className="text-right">{yen(p.share)}</dd></>}
                    {p.cleanings > 0 && <><dt>Cleaning × {p.cleanings}{st.cleaning ? ` (${yen(st.cleaning)} each)` : ''}</dt><dd className="text-right">{yen(p.cleaningTotal)}</dd></>}
                    {p.reimburse > 0 && <><dt>Paid back</dt><dd className="text-right">{yen(p.reimburse)}</dd></>}
                    {p.reimburse < 0 && <><dt>{st.manager}&apos;s purchases</dt><dd className="text-right">−{yen(-p.reimburse)}</dd></>}
                  </dl>
                </div>
              ))}
            </div>
            {!st.cleaning && st.cleaners.length > 0 && (
              <p className="mt-3 text-xs text-neutral-500">No cleaning fee set for this house yet (cleaning_fee in the Houses tab).</p>
            )}
          </section>
        )}

        {/* Year */}
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{year} by month</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-1.5 text-left font-medium">Month</th>
                  <th className="py-1.5 text-right font-medium">Stays</th>
                  <th className="py-1.5 text-right font-medium">Net income C</th>
                  {payees.map((n) => <th key={n} className="py-1.5 text-right font-medium">{n === 'You' ? 'You keep' : n}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {yearRows.map((r) => (
                  <tr key={r.m} className={r.m === month ? 'font-semibold' : r.has ? '' : 'text-neutral-400'}>
                    <td className="py-1.5"><Link href={q(r.m)} className="hover:underline">{r.label}</Link></td>
                    <td className="py-1.5 text-right">{r.has ? r.rows.length : ''}</td>
                    <td className="py-1.5 text-right">{r.has ? yen(r.C) : ''}</td>
                    {payees.map((n) => <td key={n} className="py-1.5 text-right">{r.has ? yen(paid(r, n)) : ''}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold">
                <tr className="border-t border-black/10">
                  <td className="py-1.5">Total</td><td />
                  <td className="py-1.5 text-right">{yen(sumC)}</td>
                  {payees.map((n) => <td key={n} className="py-1.5 text-right">{yen(sumPaid(n))}</td>)}
                </tr>
                <tr className="text-neutral-500">
                  <td className="py-1.5">Monthly avg</td><td />
                  <td className="py-1.5 text-right">{active.length ? yen(sumC / active.length) : ''}</td>
                  {payees.map((n) => <td key={n} className="py-1.5 text-right">{active.length ? yen(sumPaid(n) / active.length) : ''}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">{year} income by month</h2>
          <IncomeChart
            months={yearRows.map((r) => r.label)}
            series={[
              { name: 'Net income C', values: yearRows.map((r) => (r.has ? Math.round(r.C) : null)) },
              ...payees.map((n) => ({ name: n === 'You' ? 'You keep' : n, values: yearRows.map((r) => (r.has ? Math.round(paid(r, n)) : null)) })),
            ]}
          />
        </section>
      </main>
    </>
  );
}
