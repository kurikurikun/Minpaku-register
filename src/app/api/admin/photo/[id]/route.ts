import { NextResponse } from 'next/server';
import { canSee, getAdmin } from '@/lib/auth';
import { downloadPhoto, listGuests } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const admin = getAdmin();
  if (!admin) return new NextResponse('Unauthorized', { status: 401 });
  // Only serve files that belong to a guest at a house this person can see.
  const guest = (await listGuests()).find((g) => g.passport_file_id === params.id);
  if (!guest || !canSee(admin, guest.house_id)) return new NextResponse('Not found', { status: 404 });
  const { data, mimeType } = await downloadPhoto(params.id);
  return new NextResponse(data, { headers: { 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=3600' } });
}
