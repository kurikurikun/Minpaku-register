'use client';

import { useTransition } from 'react';
import { removeBooking } from '@/app/admin/actions';

export default function DeleteBookingButton({ token, registered }: { token: string; registered: number }) {
  const [pending, start] = useTransition();
  const warn = registered
    ? `Delete this booking?\n\n${registered} guest${registered === 1 ? ' has' : 's have'} already registered. They will disappear from the app and the register, and the check-in link will stop working.\n\n(The rows stay in your Google Sheet.)`
    : 'Delete this booking?\n\nThe check-in link will stop working.';
  return (
    <button
      type="button"
      className="btn-ghost text-sm"
      disabled={pending}
      onClick={() => confirm(warn) && start(() => removeBooking(token))}
    >
      {pending ? 'Deleting…' : 'Delete booking'}
    </button>
  );
}
