'use client';

import { useEffect, useRef, useState } from 'react';

export type ChartSeries = { name: string; values: (number | null)[] };

// Monochrome: series are told apart by shade AND dash pattern (plus the legend),
// never by shade alone. The first series (net income C) is the solid black headline.
const STYLES = [
  { stroke: '#111111', dash: '', width: 2.5 },
  { stroke: '#5c5c5c', dash: '6 4', width: 2 },
  { stroke: '#8a8a8a', dash: '2 3', width: 2 },
  { stroke: '#a8a8a8', dash: '10 3 2 3', width: 2 },
  { stroke: '#c2c2c2', dash: '', width: 2 },
];

const H = 260, L = 52, R = 10, T = 14, B = 28;

function niceStep(range: number) {
  const raw = range / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}
const yen = (n: number) => `¥${Math.round(n).toLocaleString('en-US')}`;
const short = (n: number) => (Math.abs(n) >= 10000 ? `¥${Math.round(n / 1000)}k` : yen(n));

export default function IncomeChart({ months, series }: { months: string[]; series: ChartSeries[] }) {
  const [active, setActive] = useState<number | null>(null);
  // Draw at the real on-screen width so text stays readable on phones.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (!all.length) return <p className="text-sm text-neutral-500">No data for this year yet.</p>;

  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const step = niceStep(hi - lo || 1);
  const yMin = Math.floor(lo / step) * step, yMax = Math.ceil(hi / step) * step || step;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(v);
  const x = (i: number) => L + ((W - L - R) * (i + 0.5)) / months.length;
  const y = (v: number) => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin));
  const colW = (W - L - R) / months.length;

  // Break lines at months with no data.
  const paths = series.map((s) => {
    let d = '', pen = false;
    s.values.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  const tip = active !== null ? series.map((s, k) => ({ name: s.name, v: s.values[active], k })) : [];
  const tipLeft = active !== null && x(active) > W * 0.6;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        {series.map((s, k) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke={STYLES[k % STYLES.length].stroke} strokeWidth="2" strokeDasharray={STYLES[k % STYLES.length].dash} strokeLinecap="round" /></svg>
            {s.name}
          </span>
        ))}
      </div>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={`Monthly ${series.map((s) => s.name).join(', ')}`} onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#9a9a9a' : '#d9d9d9'} strokeWidth={t === 0 ? 1 : 0.75} />
              <text x={L - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10.5" fill="#737373">{short(t)}</text>
            </g>
          ))}
          {months.map((m, i) => (W < 480 && i % 2 === 1 && active !== i ? null :
            <text key={m} x={x(i)} y={H - 9} textAnchor="middle" fontSize="10.5" fill={active === i ? '#111' : '#737373'}>{m}</text>
          ))}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={T} y2={H - B} stroke="#9a9a9a" strokeWidth="1" />}
          {paths.map((d, k) => (
            <path key={k} d={d} fill="none" stroke={STYLES[k % STYLES.length].stroke} strokeWidth={STYLES[k % STYLES.length].width} strokeDasharray={STYLES[k % STYLES.length].dash} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {series.map((s, k) =>
            s.values.map((v, i) =>
              v === null ? null : (
                <circle key={`${k}-${i}`} cx={x(i)} cy={y(v)} r={active === i ? 4.5 : 3} fill={STYLES[k % STYLES.length].stroke} stroke="#f7f7f7" strokeWidth="1.5" />
              ),
            ),
          )}
          {/* Hit areas: one full-height column per month (bigger than the marks). */}
          {months.map((m, i) => (
            <rect key={`hit-${m}`} x={L + colW * i} y={T} width={colW} height={H - T - B} fill="transparent" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
          ))}
        </svg>
        {active !== null && tip.some((t) => t.v !== null) && (
          <div
            className="glass pointer-events-none absolute top-2 rounded-2xl px-3 py-2 text-xs"
            style={tipLeft ? { right: `${100 - (x(active) / W) * 100 + 2}%` } : { left: `${(x(active) / W) * 100 + 2}%` }}
          >
            <div className="mb-1 font-semibold">{months[active]}</div>
            {tip.map((t) => (
              <div key={t.name} className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 text-neutral-600">
                  <svg width="14" height="6" aria-hidden><line x1="1" y1="3" x2="13" y2="3" stroke={STYLES[t.k % STYLES.length].stroke} strokeWidth="2" strokeDasharray={STYLES[t.k % STYLES.length].dash} /></svg>
                  {t.name}
                </span>
                <span className="font-medium tabular-nums">{t.v === null ? '—' : yen(t.v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
