import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { listGuests } from '@/lib/db';
import { downloadPhoto } from '@/lib/google';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!isAdmin()) return new NextResponse('Unauthorized', { status: 401 });
  // Only serve files that belong to a guest record.
  if (!(await listGuests()).some((g) => g.passport_file_id === params.id)) return new NextResponse('Not found', { status: 404 });
  const data = await downloadPhoto(params.id);
  return new NextResponse(data, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
}
