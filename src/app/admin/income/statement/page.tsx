import { Fragment } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { incomeSnapshot, listBookings, listGuests, listHouses } from '@/lib/db';
import { MANAGER_PREFIX, num, statement, yen } from '@/lib/income';
import PrintButton from '@/components/PrintButton';
import CopyButton from '@/components/CopyButton';

export const dynamic = 'force-dynamic';

const md = (d: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');

// One person's monthly statement (for their invoice): stays, utilities, A/B/C and their payment.
export default async function StatementPage({ searchParams }: { searchParams: { house?: string; month?: string; to?: string } }) {
  const admin = requireAdmin();
  if (!admin.houses.includes('*')) redirect('/admin');
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : '';
  const [houses, data, bookings, guests] = await Promise.all([listHouses(), incomeSnapshot(), listBookings(), listGuests()]);
  const house = houses.find((h) => h.id === searchParams.house);
  if (!house || !month) notFound();

  const registered = new Map<string, number>();
  for (const b of bookings) if (b.booking_ref) registered.set(b.booking_ref, guests.filter((g) => g.token === b.token).length);
  const stays = data.income.filter((r) => r.house_id === house.id && r.month === month).map((r) => ({ ...r, people: r.people || String(registered.get(r.code) || '') }));
  const expenses = data.expenses.filter((e) => e.house_id === house.id && e.month === month);
  const st = statement(house, stays, expenses);
  const p = st.payouts.find((x) => x.name === searchParams.to) ?? st.payouts.find((x) => !x.remainder);
  if (!p) notFound();

  const monthName = new Date(`${month}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const utilities = expenses
    .filter((e) => !e.item.startsWith(MANAGER_PREFIX) && !(st.taxRate && e.item === 'Accommodation tax'))
    .map((e) => ({ label: e.item, value: num(e.amount) }));
  if (st.taxRate) utilities.push({ label: 'Accommodation tax', value: st.taxTotal });
  if (st.fromShares) st.reimburse.forEach((e) => utilities.push({ label: `${e.label} (${st.manager})`, value: e.value }));

  const lines = [
    p.pct > 0 ? { label: `${p.pct}% of net income C`, value: p.share } : null,
    p.cleanings > 0 ? { label: `Cleaning × ${p.cleanings} (${yen(st.cleaning)} each)`, value: p.cleaningTotal } : null,
    p.reimburse > 0 ? { label: 'Expenses paid back', value: p.reimburse } : null,
  ].filter((x): x is { label: string; value: number } => !!x);
  const myCleanings = st.rows.filter((r) => r.cleanedBy === p.name);

  const text = [
    `${house.name} — ${monthName}`,
    `Statement for ${p.name}`,
    '',
    `Stays (${st.rows.length})`,
    ...st.rows.map((r) => `${md(r.check_in)}–${md(r.check_out)} ${r.guest || ''}: ${yen(r.incl)} (${yen(r.excl)} excl. cleaning), ${r.people || '?'} people × ${r.nights} nights${r.tax ? `, tax ${yen(r.tax)}` : ''}`),
    `Accommodation total (A): ${yen(st.A)}`,
    '',
    'Utilities & expenses',
    ...utilities.map((u) => `${u.label}: ${yen(u.value)}`),
    `Total (B): ${yen(st.B)}`,
    '',
    `Net income C = A − B: ${yen(st.C)}`,
    '',
    `Payment to ${p.name}`,
    ...(p.reimburse > 0 ? st.reimburse.map((e) => `  ${e.label}: ${yen(e.value)}`) : []),
    ...lines.map((l) => `${l.label}: ${yen(l.value)}`),
    `Total: ${yen(p.total)}`,
  ].join('\n');

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/admin/income?house=${house.id}&month=${month}`} className="btn-ghost px-4 py-2 text-sm">← Back</Link>
        <div className="ml-auto flex gap-2">
          <CopyButton text={text} label="Copy text" />
          <PrintButton />
        </div>
      </div>

      <article className="card space-y-6 print:rounded-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b border-black/10 pb-4">
          <div>
            <div className="text-sm text-neutral-500">Monthly statement 月次明細</div>
            <h1 className="text-2xl font-semibold">{house.name} · {monthName}</h1>
          </div>
          <div className="text-right">
            <div className="text-sm text-neutral-500">For</div>
            <div className="text-xl font-semibold">{p.name}</div>
          </div>
        </header>

        <section>
          <h2 className="mb-2 font-semibold">Accommodation income 宿泊収入</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Guest</th>
                  <th className="py-1.5 pr-2 font-medium">Dates</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Incl. cleaning</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Not incl.</th>
                  <th className="py-1.5 pr-2 text-right font-medium">People</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Nights</th>
                  <th className="py-1.5 pr-2 text-right font-medium">宿泊数</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Tax</th>
                  {st.cleaners.length > 1 && <th className="py-1.5 font-medium">Cleaned by</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {st.rows.map((r) => (
                  <tr key={r.code}>
                    <td className="py-1.5 pr-2">{r.guest || '—'}</td>
                    <td className="whitespace-nowrap py-1.5 pr-2">{md(r.check_in)} → {md(r.check_out)}</td>
                    <td className="py-1.5 pr-2 text-right">{yen(r.incl)}</td>
                    <td className="py-1.5 pr-2 text-right">{yen(r.excl)}</td>
                    <td className="py-1.5 pr-2 text-right">{r.people || '?'}</td>
                    <td className="py-1.5 pr-2 text-right">{r.nights}</td>
                    <td className="py-1.5 pr-2 text-right">{r.personNights || ''}</td>
                    <td className="py-1.5 pr-2 text-right">{r.tax ? yen(r.tax) : 0}</td>
                    {st.cleaners.length > 1 && <td className="py-1.5">{r.cleanedBy}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold">
                <tr className="border-t border-black/10">
                  <td className="py-1.5" colSpan={3}>Accommodation total (A)</td>
                  <td className="py-1.5 pr-2 text-right">{yen(st.A)}</td>
                  <td />
                  <td className="py-1.5 pr-2 text-right">{st.nights}</td>
                  <td className="py-1.5 pr-2 text-right">{st.personNights || ''}</td>
                  <td className="py-1.5 pr-2 text-right">{st.taxTotal ? yen(st.taxTotal) : 0}</td>
                  {st.cleaners.length > 1 && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Utilities & expenses 光熱費・経費</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            {utilities.length === 0 && <><dt className="text-neutral-500">None</dt><dd /></>}
            {utilities.map((u) => <Fragment key={u.label}><dt>{u.label}</dt><dd className="text-right">{yen(u.value)}</dd></Fragment>)}
            <dt className="border-t border-black/10 pt-1.5 font-semibold">Total (B)</dt>
            <dd className="border-t border-black/10 pt-1.5 text-right font-semibold">{yen(st.B)}</dd>
          </dl>
        </section>

        <section className="rounded-2xl bg-black/90 p-4 text-white print:bg-white print:p-0 print:text-black">
          <div className="text-sm opacity-70">Net income C = A − B 純利益</div>
          <div className="text-2xl font-semibold">{yen(st.C)}</div>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Payment to {p.name} お支払い</h2>
          {p.reimburse > 0 && (
            <ul className="mb-2 text-sm text-neutral-600">
              {st.reimburse.map((e) => <li key={e.item}>· {e.label}: {yen(e.value)}</li>)}
            </ul>
          )}
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            {lines.map((l) => <Fragment key={l.label}><dt>{l.label}</dt><dd className="text-right">{yen(l.value)}</dd></Fragment>)}
            <dt className="border-t border-black/10 pt-2 text-lg font-semibold">Total 合計</dt>
            <dd className="border-t border-black/10 pt-2 text-right text-lg font-semibold">{yen(p.total)}</dd>
          </dl>
          {p.cleanings > 0 && st.cleaners.length > 1 && (
            <p className="mt-2 text-xs text-neutral-500">Cleanings: {myCleanings.map((r) => `${md(r.check_in)}–${md(r.check_out)}`).join(', ')}</p>
          )}
        </section>
      </article>
    </main>
  );
}
