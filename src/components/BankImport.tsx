'use client';

import { useMemo, useState, useTransition } from 'react';
import { importExpenses } from '@/app/admin/income/actions';
import { EXPENSE_ITEMS } from '@/lib/income';

type Tx = { id: number; date: string; text: string; amount: number };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const toIso = (v: string) => {
  const m = v.trim().match(/^(\d{4})[/年.-](\d{1,2})[/月.-](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
};
const money = (v: string) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
const nextMonth = (m: string) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
};
const toHalf = (s: string) => s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');

// Guess the expense line from the bank description (Japanese bank wording, half/full width).
function guess(text: string): string {
  const t = toHalf(text);
  if (/ガス|ｶﾞｽ/.test(t)) return 'Gas';
  if (/電気|デントウ|ﾃﾞﾝﾄｳ|電力|デンリヨク/.test(t)) return 'Power';
  if (/水道|スイドウ|ｽｲﾄﾞｳ/.test(t)) return 'Water';
  if (/NTT|ソフトバンク|ドコモ|KDDI|AU|フレツツ|インターネツト|WIFI|ポケツト/i.test(t)) return 'Internet';
  return '';
}

export default function BankImport(props: { houses: { id: string; name: string }[]; initialHouse?: string; existing: Record<string, string> }) {
  const [house, setHouse] = useState(props.initialHouse && props.houses.some((h) => h.id === props.initialHouse) ? props.initialHouse : props.houses[0]?.id ?? '');
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [pick, setPick] = useState<Record<number, string>>({}); // tx id -> expense item ('' = not included)
  const [shift, setShift] = useState(false); // bills count in the month they were paid, unless ticked
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  async function onFile(f?: File) {
    if (!f) return;
    setError('');
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if ((text.match(/�/g) ?? []).length > 3) text = new TextDecoder('shift_jis').decode(buf);
    const rows = parseCsv(text.replace(/^﻿/, ''));
    const h = rows.findIndex((r) => r.some((c) => /日付|取引日/.test(c)) && r.some((c) => /引出|出金|支払/.test(c)));
    if (h < 0) { setError("Couldn't find the transactions in this file (looking for 日付 and お引出し columns)."); setTxs(null); return; }
    const head = rows[h];
    const col = (re: RegExp) => head.findIndex((c) => re.test(c.trim()));
    const cDate = col(/日付|取引日/), cText = col(/取引内容|摘要|内容|お取引/), cOut = col(/引出|出金|支払/);
    const list: Tx[] = [];
    rows.slice(h + 1).forEach((r, i) => {
      const date = toIso(r[cDate] ?? ''), amount = money(r[cOut] ?? '');
      if (date && amount > 0) list.push({ id: i, date, text: (r[cText] ?? '').trim(), amount });
    });
    list.sort((a, b) => a.date.localeCompare(b.date));
    setTxs(list);
    setFileName(f.name);
    setPick(Object.fromEntries(list.map((t) => [t.id, guess(t.text)])));
  }

  const monthFor = (t: Tx) => (shift ? nextMonth(t.date.slice(0, 7)) : t.date.slice(0, 7));
  // Chosen lines added up per month + item.
  const totals = useMemo(() => {
    const m = new Map<string, { month: string; item: string; amount: number; n: number }>();
    for (const t of txs ?? []) {
      const item = pick[t.id];
      if (!item) continue;
      const k = `${monthFor(t)}|${item}`;
      const prev = m.get(k) ?? { month: monthFor(t), item, amount: 0, n: 0 };
      prev.amount += t.amount; prev.n += 1;
      m.set(k, prev);
    }
    return [...m.values()].sort((a, b) => a.month.localeCompare(b.month) || a.item.localeCompare(b.item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, pick, shift]);

  function save() {
    start(async () => {
      try {
        await importExpenses(house, totals.map(({ month, item, amount }) => ({ month, item, amount })));
      } catch (e) {
        if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: string }).digest).startsWith('NEXT_REDIRECT')) throw e;
        setError('Saving failed. Please try again.');
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <h1 className="text-xl font-semibold">Upload bank statement (expenses)</h1>
        <label className="block">
          <span className="label">House</span>
          <select className="input" value={house} onChange={(e) => setHouse(e.target.value)}>
            {props.houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label className="btn-ghost w-full cursor-pointer">
          {fileName ? `📄 ${fileName} — choose another` : 'Choose bank CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <p className="text-xs text-neutral-500">Only the payments you tick are saved. Account details in the file are not stored.</p>
        {error && <p className="glass rounded-2xl p-3 text-sm font-medium">{error}</p>}
      </section>

      {txs && (
        <section className="card space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-black" checked={shift} onChange={(e) => setShift(e.target.checked)} />
            Put bills in the month <b>after</b> they were paid (normally off: a bill paid in October counts for October)
          </label>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-2 pr-2 font-medium">Paid</th>
                  <th className="py-2 pr-2 font-medium">Description</th>
                  <th className="py-2 pr-2 text-right font-medium">Amount</th>
                  <th className="py-2 pr-2 font-medium">Add as</th>
                  <th className="py-2 font-medium">Month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {txs.map((t) => (
                  <tr key={t.id} className={pick[t.id] ? '' : 'text-neutral-400'}>
                    <td className="whitespace-nowrap py-1.5 pr-2">{t.date.slice(5).replace('-', '/')}</td>
                    <td className="py-1.5 pr-2">{t.text}</td>
                    <td className="py-1.5 pr-2 text-right">¥{t.amount.toLocaleString('en-US')}</td>
                    <td className="py-1.5 pr-2">
                      <select className="input py-1.5 text-sm" value={pick[t.id] ?? ''} onChange={(e) => setPick({ ...pick, [t.id]: e.target.value })}>
                        <option value="">— skip</option>
                        {EXPENSE_ITEMS.filter((i) => i !== 'Accommodation tax').map((i) => <option key={i}>{i}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5">{pick[t.id] ? monthFor(t) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totals.length > 0 && (
            <div className="rounded-2xl bg-white/50 p-4 ring-1 ring-white/80">
              <div className="label">Will be saved to {props.houses.find((h) => h.id === house)?.name}</div>
              <ul className="text-sm">
                {totals.map((r) => {
                  const before = props.existing[`${house}|${r.month}|${r.item}`];
                  return (
                    <li key={`${r.month}|${r.item}`} className="flex justify-between gap-3 py-0.5">
                      <span>{r.month} · {r.item}{r.n > 1 ? ` (${r.n} payments added together)` : ''}</span>
                      <span>
                        ¥{r.amount.toLocaleString('en-US')}
                        {before && <span className="text-neutral-500"> (replaces {before.startsWith('¥') ? before : `¥${Number(before).toLocaleString('en-US')}`})</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <button className="btn w-full" disabled={!totals.length || pending} onClick={save}>
            {pending ? 'Saving…' : `Save ${totals.length} expense line${totals.length === 1 ? '' : 's'}`}
          </button>
        </section>
      )}
    </div>
  );
}
