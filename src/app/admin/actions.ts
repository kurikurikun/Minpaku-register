'use server';

import { redirect } from 'next/navigation';
import { canSee, checkLogin, endSession, requireAdmin, startSession } from '@/lib/auth';
import { createBooking } from '@/lib/db';

export async function login(_: string | null, fd: FormData) {
  const user = checkLogin(String(fd.get('user') ?? ''), String(fd.get('password') ?? ''));
  if (!user) return 'Wrong name or password';
  startSession(user);
  redirect('/admin');
}

export async function logout() {
  endSession();
  redirect('/admin/login');
}

export async function addBooking(_: string | null, fd: FormData) {
  const admin = requireAdmin();
  const s = (k: string) => String(fd.get(k) ?? '').trim();
  const b = {
    house_id: s('house_id'),
    check_in: s('check_in'),
    check_out: s('check_out'),
    guests: Math.max(1, Math.min(30, Number(s('guests')) || 1)),
    lead_name: s('lead_name'),
    booking_ref: s('booking_ref'),
    notes: s('notes'),
    created_by: admin.user,
  };
  if (!b.house_id || !b.check_in || !b.check_out) return 'House and dates are required';
  if (!canSee(admin, b.house_id)) return 'You do not have access to this house';
  if (b.check_out <= b.check_in) return 'Check-out must be after check-in';
  const token = await createBooking(b);
  redirect(`/admin/b/${token}?new=1`);
}
