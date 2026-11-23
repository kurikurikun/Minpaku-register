import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { incomeSnapshot, listHouses } from '@/lib/db';
import AdminNav from '@/components/AdminNav';
import BankImport from '@/components/BankImport';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function BankPage({ searchParams }: { searchParams: { house?: string } }) {
  const admin = requireAdmin();
  if (!admin.houses.includes('*')) redirect('/admin');
  const [houses, data] = await Promise.all([listHouses(), incomeSnapshot()]);
  // Existing expense values, so the preview can show what will change.
  const existing: Record<string, string> = {};
  for (const e of data.expenses) existing[`${e.house_id}|${e.month}|${e.item}`] = e.amount;
  return (
    <>
      <AdminNav />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <BankImport houses={houses.map((h) => ({ id: h.id, name: h.name }))} initialHouse={searchParams.house} existing={existing} />
      </main>
    </>
  );
}
