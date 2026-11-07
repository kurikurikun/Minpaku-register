import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/auth';
import { REGISTER_COLUMNS, registerRows } from '@/lib/register';

export const runtime = 'nodejs';

const cell = (v: string) => {
  // Neutralise spreadsheet formulas and quote for CSV.
  const s = /^[=@]|^[+\-](?![\d\s()]+$)/.test(v) ? `'${v}` : v;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(req: Request) {
  const admin = getAdmin();
  if (!admin) return new NextResponse('Unauthorized', { status: 401 });
  const p = new URL(req.url).searchParams;
  const { rows } = await registerRows(admin, { house: p.get('house') ?? '', from: p.get('from') ?? '', to: p.get('to') ?? '' });
  const lines = [
    REGISTER_COLUMNS.map(([, l]) => cell(l)).join(','),
    ...rows.map((r) => REGISTER_COLUMNS.map(([k]) => cell(r[k] ?? '')).join(',')),
  ];
  // BOM so Excel opens Japanese text correctly.
  return new NextResponse('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="guest-register-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
