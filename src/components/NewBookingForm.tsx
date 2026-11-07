'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { addBooking } from '@/app/admin/actions';
import type { House } from '@/lib/db';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" disabled={pending}>{pending ? 'Creating…' : 'Create check-in link'}</button>;
}

export default function NewBookingForm({ houses }: { houses: House[] }) {
  const [error, action] = useFormState(addBooking, null);
  return (
    <form action={action} className="card grid gap-4 sm:grid-cols-2">
      <h2 className="text-lg font-semibold sm:col-span-2">New booking</h2>
      <label className="sm:col-span-2">
        <span className="label">House</span>
        <select name="house_id" className="input" required>
          {houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>
      <label><span className="label">Check-in</span><input name="check_in" type="date" className="input" required /></label>
      <label><span className="label">Check-out</span><input name="check_out" type="date" className="input" required /></label>
      <label><span className="label">Number of guests</span><input name="guests" type="number" min={1} max={30} defaultValue={2} className="input" required /></label>
      <label><span className="label">Lead guest name</span><input name="lead_name" className="input" placeholder="optional" /></label>
      <label><span className="label">Booking ref (Airbnb code etc.)</span><input name="booking_ref" className="input" placeholder="optional" /></label>
      <label><span className="label">Notes</span><input name="notes" className="input" placeholder="optional" /></label>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
