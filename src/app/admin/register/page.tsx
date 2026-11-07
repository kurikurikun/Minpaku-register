import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { REGISTER_COLUMNS, registerRows, type RegisterFilter } from '@/lib/register';
import AdminNav from '@/components/AdminNav';
import PrintButton from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({ searchParams }: { searchParams: RegisterFilter }) {
  const admin = requireAdmin();
  const { rows, houses } = await registerRows(admin, searchParams);
  const qs = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]).toString();
  const houseName = houses.find((h) => h.id === searchParams.house)?.name ?? (houses.length === 1 ? houses[0].name : undefined);
  const cols = REGISTER_COLUMNS.filter(([k]) => k !== 'passport_url');

  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <form className="no-print card grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label>
            <span className="label">House</span>
            <select name="house" defaultValue={searchParams.house ?? ''} className="input">
              {houses.length > 1 && <option value="">All houses</option>}
              {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <label><span className="label">Check-in from</span><input type="date" name="from" defaultValue={searchParams.from} className="input" /></label>
          <label><span className="label">Check-in to</span><input type="date" name="to" defaultValue={searchParams.to} className="input" /></label>
          <button className="btn">Filter</button>
        </form>

        <div className="no-print flex gap-2">
          <PrintButton />
          <Link href={`/api/admin/export?${qs}`} className="btn-ghost">Download CSV</Link>
        </div>

        <section>
          <h1 className="text-xl font-semibold">宿泊者名簿 Guest Register</h1>
          <p className="mb-3 text-sm text-neutral-600">
            {houseName ?? 'All houses'} · {searchParams.from || '…'} – {searchParams.to || '…'} · {rows.length} guests
          </p>
          <div className="glass overflow-x-auto rounded-3xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/40">
                <tr>{cols.map(([, label]) => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {rows.map((r, i) => (
                  <tr key={i} className="align-top">
                    {cols.map(([k]) => <td key={k} className="whitespace-pre-wrap px-2 py-1.5">{r[k]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
