import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getAdmin } from '@/lib/auth';
import { incomeSnapshot, listHouses } from '@/lib/db';
import { taxReport } from '@/lib/taxreport';
import { GEKKEIHYO_XLSX } from '@/templates/gekkeihyo';

export const runtime = 'nodejs';

const FW = (s: string | number) => String(s).replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));

// Fills the Hiroshima 宿泊税月計表 Excel form for one house and month.
export async function GET(req: Request) {
  const admin = getAdmin();
  if (!admin || !admin.houses.includes('*')) return new NextResponse('Unauthorized', { status: 401 });
  const p = new URL(req.url).searchParams;
  const month = p.get('month') ?? '';
  const house = (await listHouses()).find((h) => h.id === p.get('house'));
  if (!house || !/^\d{4}-\d{2}$/.test(month)) return new NextResponse('Not found', { status: 404 });

  const { income } = await incomeSnapshot();
  const rep = taxReport(house, income, month);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(GEKKEIHYO_XLSX, 'base64'));
  const ws = wb.worksheets[0];
  ws.getCell('A2').value = house.tax_facility || house.name;
  if (house.tax_code) ws.getCell('AQ1').value = /^\d+$/.test(house.tax_code) ? Number(house.tax_code) : house.tax_code;
  if (house.tax_number) ws.getCell('AQ2').value = /^\d{1,15}$/.test(house.tax_number) ? Number(house.tax_number) : house.tax_number;
  ws.getCell('A5').value = `宿　泊　税　月　計　表　　（令和　${FW(rep.reiwa)}　年　${rep.monthNum}　月）${house.tax_number ?? ''}`;
  const put = (addr: string, v: number) => { ws.getCell(addr).value = v ? v : null; };
  for (const d of rep.days) {
    const row = 10 + d.day;
    put(`E${row}`, d.taxable);
    put(`R${row}`, d.nonTaxable);
    put(`AB${row}`, d.under6000);
    put(`AJ${row}`, d.school);
    put(`AR${row}`, d.total);
  }
  ws.getCell('H42').value = rep.totals.taxable;
  ws.getCell('R42').value = rep.totals.nonTaxable;
  ws.getCell('AD42').value = rep.totals.under6000;
  put('AL42', rep.totals.school);
  ws.getCell('AR42').value = rep.totals.total;

  const buf = await wb.xlsx.writeBuffer();
  const name = `宿泊税月計表_令和${rep.reiwa}年${rep.monthNum}月_${house.id}.xlsx`;
  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="gekkeihyo_${month}_${house.id}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
