'use client';

import { useMemo, useState, useTransition } from 'react';
import { importStays, type UploadRow } from '@/app/admin/income/actions';

type Field = 'type' | 'code' | 'start' | 'end' | 'nights' | 'guest' | 'listing' | 'amount' | 'currency' | 'adults' | 'children' | 'infants';
const FIELDS: { key: Field; label: string; required?: boolean; match: RegExp }[] = [
  { key: 'code', label: 'Confirmation code', required: true, match: /confirmation|確認コード|予約コード/i },
  { key: 'start', label: 'Check-in date', required: true, match: /^start|開始日|チェックイン/i },
  { key: 'amount', label: 'Payout amount', required: true, match: /^amount$|^金額$|^受取額|^支払額|^お支払い額/i },
  { key: 'end', label: 'Check-out date', match: /^end|終了日|チェックアウト/i },
  { key: 'nights', label: 'Nights', match: /night|泊数/i },
  { key: 'guest', label: 'Guest', match: /^guest|ゲスト/i },
  { key: 'listing', label: 'Listing', match: /listing|リスティング/i },
  { key: 'type', label: 'Type', match: /^type$|種類|種別|タイプ/i },
  { key: 'currency', label: 'Currency', match: /^currency$|^通貨$/i },
  { key: 'adults', label: 'Adults', match: /^adults?$|^大人$/i },
  { key: 'children', label: 'Children', match: /^child(ren)?$|^子ども$|^子供$/i },
  { key: 'infants', label: 'Infants', match: /^infants?$|^乳幼児$/i },
];

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
  return rows.filter((r) => r.some((c) => c.trim()));
}

function toIso(v: string) {
  const s = v.trim();
  let m = s.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // MM/DD/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}
const money = (v: string) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default function CsvImport(props: { houses: { id: string; name: string }[]; initialHouse?: string; registered: Record<string, number> }) {
  const [house, setHouse] = useState(props.initialHouse && props.houses.some((h) => h.id === props.initialHouse) ? props.initialHouse : props.houses[0]?.id ?? '');
  const [table, setTable] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState<Partial<Record<Field, number>>>({});
  const [listing, setListing] = useState('');
  const [month, setMonth] = useState('');
  const [people, setPeople] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  async function onFile(f?: File) {
    if (!f) return;
    setError('');
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if ((text.match(/�/g) ?? []).length > 5) text = new TextDecoder('shift_jis').decode(buf); // older Japanese Excel exports
    const rows = parseCsv(text.replace(/^﻿/, ''));
    // Header = first row that names a confirmation code / date column; otherwise the first row.
    const h = Math.max(0, rows.findIndex((r) => r.some((c) => FIELDS[0].match.test(c.trim()) || FIELDS[1].match.test(c.trim()))));
    const header = rows[h] ?? [];
    const guess: Partial<Record<Field, number>> = {};
    for (const f2 of FIELDS) {
      const i = header.findIndex((c) => f2.match.test(c.trim()));
      if (i >= 0) guess[f2.key] = i;
    }
    setTable(rows.slice(h));
    setMap(guess);
    setFileName(f.name);
    setListing('');
    setMonth('');
  }

  const header = table?.[0] ?? [];
  const body = table?.slice(1) ?? [];
  const get = (r: string[], k: Field) => (map[k] !== undefined ? (r[map[k]!] ?? '').trim() : '');
  const missing = FIELDS.filter((f) => f.required && map[f.key] === undefined);

  // Reservation rows, combined per confirmation code (Airbnb can split one stay across lines).
  const stays = useMemo(() => {
    if (!table || missing.length) return [];
    const by = new Map<string, UploadRow & { listing: string; currency: string }>();
    for (const r of body) {
      const type = get(r, 'type');
      if (type && (!/reserv|予約/i.test(type) || /payout|入金|振込|支払い/i.test(type))) continue;
      const code = get(r, 'code');
      const check_in = toIso(get(r, 'start'));
      const amount = money(get(r, 'amount'));
      if (!code || !check_in || !amount) continue;
      const nights = get(r, 'nights').replace(/\D/g, '');
      const prev = by.get(code);
      if (prev) {
        prev.amount = String(money(prev.amount) + amount);
        continue;
      }
      by.set(code, {
        code, check_in,
        check_out: toIso(get(r, 'end')) || (nights ? addDays(check_in, Number(nights)) : ''),
        nights, guest: get(r, 'guest'), amount: String(amount),
        // Airbnb's own occupancy-tax column isn't the prefecture tax the host pays; that is worked out on the Income page.
        occupancy_tax: '',
        // Guest count from Airbnb (adults + children + infants), if the file has it.
        people: map.adults !== undefined ? String(money(get(r, 'adults')) + money(get(r, 'children')) + money(get(r, 'infants')) || '') : '',
        listing: get(r, 'listing'),
        currency: get(r, 'currency').toUpperCase(),
      });
    }
    return [...by.values()].sort((a, b) => a.check_in.localeCompare(b.check_in));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, map]);

  const listings = [...new Set(stays.map((s) => s.listing).filter(Boolean))];
  const activeListing = listings.length > 1 ? listing || listings[0] : '';
  const byListing = stays.filter((s) => !activeListing || s.listing === activeListing);
  const months = [...new Set(byListing.map((s) => s.check_in.slice(0, 7)))].sort();
  const activeMonth = month || months[months.length - 1] || '';
  const chosen = byListing.filter((s) => !activeMonth || s.check_in.startsWith(activeMonth));
  const total = chosen.reduce((t, s) => t + money(s.amount), 0);
  // Only the reservation lines matter (Airbnb's payout lines can be in another currency).
  const notYen = [...new Set(chosen.map((s) => s.currency).filter((c) => c && c !== 'JPY'))];

  // People: what you typed, else registered guests, else Airbnb's guest count.
  const peopleFor = (s: { code: string; people: string }) => people[s.code] ?? (props.registered[s.code] ? String(props.registered[s.code]) : s.people);

  function save() {
    const rows = chosen.map(({ listing: _l, currency: _c, ...s }) => ({ ...s, people: peopleFor(s) }));
    start(async () => {
      try {
        await importStays(house, rows);
      } catch (e) {
        if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: string }).digest).startsWith('NEXT_REDIRECT')) throw e;
        setError('Saving failed. Please try again.');
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <h1 className="text-xl font-semibold">Upload Airbnb earnings CSV</h1>
        <label className="block">
          <span className="label">House</span>
          <select className="input" value={house} onChange={(e) => setHouse(e.target.value)}>
            {props.houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <label className="btn-ghost w-full cursor-pointer">
          {fileName ? `📄 ${fileName} — choose another` : 'Choose CSV file'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <p className="text-xs text-neutral-500">Airbnb → Earnings (収益) → Transaction history (取引履歴) → filter by listing and dates → download CSV.</p>
      </section>

      {table && (
        <details className="card" open={missing.length > 0}>
          <summary className="cursor-pointer font-semibold">
            Columns {missing.length > 0 ? `— please pick: ${missing.map((m) => m.label).join(', ')}` : '(detected automatically)'}
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-xs">
                {f.label}{f.required && ' *'}
                <select
                  className="input mt-1 py-2 text-sm"
                  value={map[f.key] ?? ''}
                  onChange={(e) => setMap({ ...map, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) })}
                >
                  <option value="">—</option>
                  {header.map((c, i) => <option key={i} value={i}>{c || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
        </details>
      )}

      {table && !missing.length && (
        <section className="card space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {listings.length > 1 && (
              <label>
                <span className="label">Listing in the file</span>
                <select className="input" value={activeListing} onChange={(e) => setListing(e.target.value)}>
                  {listings.map((l) => <option key={l}>{l}</option>)}
                </select>
              </label>
            )}
            {months.length > 0 && (
              <label>
                <span className="label">Month (by check-in)</span>
                <select className="input" value={activeMonth} onChange={(e) => setMonth(e.target.value)}>
                  {months.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
            )}
          </div>

          {chosen.length === 0 ? (
            <p className="text-neutral-500">No reservations found. Check the column choices above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="py-2 pr-2 font-medium">Guest</th>
                    <th className="py-2 pr-2 font-medium">Dates</th>
                    <th className="py-2 pr-2 text-right font-medium">Nights</th>
                    <th className="py-2 pr-2 text-right font-medium">Payout</th>
                    <th className="py-2 pr-2 font-medium">People</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {chosen.map((s) => (
                    <tr key={s.code}>
                      <td className="py-2 pr-2">{s.guest || '—'}<div className="text-xs text-neutral-500">{s.code}</div></td>
                      <td className="whitespace-nowrap py-2 pr-2">{s.check_in.slice(5).replace('-', '/')} → {s.check_out.slice(5).replace('-', '/')}</td>
                      <td className="py-2 pr-2 text-right">{s.nights}</td>
                      <td className="py-2 pr-2 text-right">¥{money(s.amount).toLocaleString('en-US')}</td>
                      <td className="py-2 pr-2">
                        <input
                          className="input w-20 py-1.5"
                          inputMode="numeric"
                          value={peopleFor(s)}
                          placeholder="?"
                          onChange={(e) => setPeople({ ...people, [s.code]: e.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="py-2" colSpan={3}>{chosen.length} stays</td>
                    <td className="py-2 pr-2 text-right">¥{total.toLocaleString('en-US')}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <p className="mt-2 text-xs text-neutral-500">People is filled in from guest registrations, or Airbnb&apos;s guest count. It&apos;s used for 宿泊数 and the accommodation tax.</p>
            </div>
          )}
          {notYen.length > 0 && (
            <p className="glass-dark rounded-2xl p-3 text-sm text-white">
              This file is in {notYen.join(', ')}, not yen. In Airbnb, change the currency to JPY (bottom of the page → 通貨 / currency) and download the CSV again.
            </p>
          )}
          {error && <p className="glass rounded-2xl p-3 text-sm font-medium">{error}</p>}
          <button className="btn w-full" disabled={!chosen.length || pending || notYen.length > 0} onClick={save}>
            {pending ? 'Saving…' : `Save ${chosen.length} stays to ${props.houses.find((h) => h.id === house)?.name}`}
          </button>
        </section>
      )}
    </div>
  );
}
