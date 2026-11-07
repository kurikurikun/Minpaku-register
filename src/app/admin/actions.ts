'use server';

import { redirect } from 'next/navigation';
import { checkPassword, endSession, requireAdmin, startSession } from '@/lib/auth';
import { createBooking } from '@/lib/db';

export async function login(_: string | null, fd: FormData) {
  if (!checkPassword(String(fd.get('password') ?? ''))) return 'Wrong password';
  startSession();
  redirect('/admin');
}

export async function logout() {
  endSession();
  redirect('/admin/login');
}

export async function addBooking(_: string | null, fd: FormData) {
  requireAdmin();
  const s = (k: string) => String(fd.get(k) ?? '').trim();
  const b = {
    house_id: s('house_id'),
    check_in: s('check_in'),
    check_out: s('check_out'),
    guests: Math.max(1, Math.min(30, Number(s('guests')) || 1)),
    lead_name: s('lead_name'),
    booking_ref: s('booking_ref'),
    notes: s('notes'),
  };
  if (!b.house_id || !b.check_in || !b.check_out) return 'House and dates are required';
  if (b.check_out <= b.check_in) return 'Check-out must be after check-in';
  const token = await createBooking(b);
  redirect(`/admin/b/${token}?new=1`);
}
