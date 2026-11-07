'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addBooking } from '@/app/admin/actions';
import type { House } from '@/lib/db';
import type { Reservation } from '@/lib/ical';

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" disabled={pending}>{pending ? 'Creating…' : 'Create check-in link'}</button>;
}

const short = (d: string) => {
  const [, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}`;
};
const nights = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);

export default function NewBookingForm(props: {
  houses: House[];
  reservations: Reservation[];
  linkedRefs: string[];
  calErrors: string[];
}) {
  const [error, action] = useFormState(addBooking, null);
  const [f, setF] = useState({ house_id: props.houses[0]?.id ?? '', check_in: '', check_out: '', booking_ref: '', notes: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const houseName = (id: string) => props.houses.find((h) => h.id === id)?.name ?? id;
  const multi = props.houses.length > 1;

  function pick(r: Reservation) {
    setF({
      house_id: r.house_id,
      check_in: r.check_in,
      check_out: r.check_out,
      booking_ref: r.code,
      notes: r.phone_last4 ? `Phone ends ${r.phone_last4}` : '',
    });
    document.getElementById('guests')?.focus();
  }

  return (
    <form action={action} className="card grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      <h2 className="text-lg font-semibold sm:col-span-2">New booking</h2>

      {(props.reservations.length > 0 || props.calErrors.length > 0) && (
        <div className="min-w-0 sm:col-span-2">
          <span className="label">From Airbnb calendar — tap to fill in</span>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {props.reservations.map((r) => {
              const linked = !!r.code && props.linkedRefs.includes(r.code);
              const active = f.booking_ref === r.code && f.check_in === r.check_in && f.house_id === r.house_id;
              return (
                <button
                  type="button"
                  key={`${r.house_id}-${r.check_in}-${r.code}`}
                  onClick={() => pick(r)}
                  className={`shrink-0 rounded-2xl px-3.5 py-2.5 text-left text-sm transition ${active ? 'glass-dark text-white' : 'glass'} ${linked && !active ? 'opacity-55' : ''}`}
                >
                  <div className="font-semibold">
                    {short(r.check_in)} → {short(r.check_out)} <span className="font-normal opacity-70">· {nights(r.check_in, r.check_out)}n</span>
                  </div>
                  <div className="mt-0.5 text-xs opacity-70">
                    {multi && <>{houseName(r.house_id)} · </>}
                    {r.code || 'No code'}
                    {r.phone_last4 && <> · Tel …{r.phone_last4}</>}
                    {linked && <> · link sent</>}
                  </div>
                </button>
              );
            })}
          </div>
          {props.calErrors.length > 0 && (
            <p className="mt-1 text-xs text-neutral-500">Couldn&apos;t load the calendar for {props.calErrors.join(', ')}. Check its ical_url in the Houses tab.</p>
          )}
        </div>
      )}

      <label className="sm:col-span-2">
        <span className="label">House</span>
        <select name="house_id" className="input" required value={f.house_id} onChange={set('house_id')}>
          {props.houses.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>
      <label><span className="label">Check-in</span><input name="check_in" type="date" className="input" required value={f.check_in} onChange={set('check_in')} /></label>
      <label><span className="label">Check-out</span><input name="check_out" type="date" className="input" required value={f.check_out} onChange={set('check_out')} /></label>
      <label><span className="label">Number of guests</span><input id="guests" name="guests" type="number" min={1} max={30} defaultValue={2} className="input" required /></label>
      <label><span className="label">Lead guest name</span><input name="lead_name" className="input" placeholder="optional" /></label>
      <label><span className="label">Booking ref (Airbnb code etc.)</span><input name="booking_ref" className="input" placeholder="optional" value={f.booking_ref} onChange={set('booking_ref')} /></label>
      <label><span className="label">Notes</span><input name="notes" className="input" placeholder="optional" value={f.notes} onChange={set('notes')} /></label>
      {error && <p className="text-sm font-medium text-neutral-900 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2"><Submit /></div>
    </form>
  );
}
