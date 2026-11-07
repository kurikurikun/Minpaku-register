'use client';

import { useState } from 'react';
import { DICTS, LANGS, fmt, type Lang } from '@/lib/i18n';

type GuestDraft = {
  fullName: string;
  livesInJapan: '' | 'yes' | 'no';
  nationality: string;
  passportNo: string;
  address: string;
  occupation: string;
  phone: string;
  email: string;
  photo: Blob | null;
  preview: string;
  saved: boolean;
};

const empty = (): GuestDraft => ({
  fullName: '', livesInJapan: '', nationality: '', passportNo: '', address: '', occupation: '',
  phone: '', email: '', photo: null, preview: '', saved: false,
});

// Shrink phone photos so uploads are fast and stay under server size limits.
async function compress(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const max = 1800;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('compress failed'))), 'image/jpeg', 0.85),
    );
  } catch {
    return file; // fall back to the original file
  } finally {
    URL.revokeObjectURL(url);
  }
}

function isComplete(g: GuestDraft, isLead: boolean) {
  if (!g.fullName.trim() || !g.livesInJapan || !g.address.trim() || !g.occupation.trim()) return false;
  if (g.livesInJapan === 'no' && (!g.nationality.trim() || !g.passportNo.trim() || !g.photo)) return false;
  if (isLead && (!g.phone.trim() || !g.email.trim())) return false;
  return true;
}

export default function CheckinForm(props: {
  token: string;
  initialLang: Lang;
  houseName: string;
  checkIn: string;
  checkOut: string;
  totalGuests: number;
  startNo: number;
}) {
  const [lang, setLang] = useState<Lang>(props.initialLang);
  const t = DICTS[lang];
  const count = props.totalGuests - props.startNo + 1;
  const [guests, setGuests] = useState<GuestDraft[]>(() => Array.from({ length: count }, empty));
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const update = (i: number, patch: Partial<GuestDraft>) =>
    setGuests((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  async function onPhoto(i: number, file?: File) {
    if (!file) return;
    const blob = await compress(file);
    update(i, { photo: blob, preview: URL.createObjectURL(blob) });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const leadIndex = props.startNo === 1 ? 0 : -1;
    if (!consent || guests.some((g, i) => !isComplete(g, i === leadIndex))) {
      setError(t.required);
      return;
    }
    setStatus('sending');
    try {
      for (let i = 0; i < guests.length; i++) {
        const g = guests[i];
        if (g.saved) continue; // already sent on an earlier attempt
        setProgress(fmt(t.sending, { n: i + 1, total: guests.length }));
        const fd = new FormData();
        fd.set('guest_no', String(props.startNo + i));
        fd.set('full_name', g.fullName);
        fd.set('lives_in_japan', g.livesInJapan);
        fd.set('address', g.address);
        fd.set('occupation', g.occupation);
        fd.set('lang', lang);
        if (g.livesInJapan === 'no') {
          fd.set('nationality', g.nationality);
          fd.set('passport_no', g.passportNo);
          if (g.photo) fd.set('photo', g.photo, 'passport.jpg');
        }
        if (i === leadIndex) {
          fd.set('phone', g.phone);
          fd.set('email', g.email);
        }
        const res = await fetch(`/api/checkin/${props.token}`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error(await res.text());
        update(i, { saved: true });
      }
      setStatus('done');
      window.scrollTo({ top: 0 });
    } catch {
      setError(t.error);
      setStatus('idle');
    }
  }

  if (status === 'done') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="card">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sea-light text-3xl text-sea">✓</div>
          <h1 className="text-2xl font-semibold">{t.doneTitle}</h1>
          <p className="mt-2 text-stone-600">{t.doneBody}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <div className="mb-4 flex justify-end">
        <select
          aria-label="Language"
          className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="mt-1 text-lg text-sea">{props.houseName}</p>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">{t.intro}</p>

      <div className="card mt-5 grid grid-cols-3 gap-2 text-center text-sm">
        <div><div className="text-stone-500">{t.checkIn}</div><div className="font-semibold">{props.checkIn}</div></div>
        <div><div className="text-stone-500">{t.checkOut}</div><div className="font-semibold">{props.checkOut}</div></div>
        <div><div className="text-stone-500">{t.guests}</div><div className="font-semibold">{props.totalGuests}</div></div>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
        {guests.map((g, i) => {
          const no = props.startNo + i;
          const isLead = no === 1;
          return (
            <fieldset key={i} className="card space-y-4" disabled={g.saved || status === 'sending'}>
              <legend className="sr-only">{fmt(t.guestN, { n: no })}</legend>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {fmt(t.guestN, { n: no })}
                  {isLead && <span className="ml-2 rounded-full bg-sea-light px-2 py-0.5 text-xs font-medium text-sea">{t.mainContact}</span>}
                </h2>
                {g.saved && <span className="text-sm text-sea">✓ {t.saved}</span>}
              </div>

              <Field label={t.fullName}>
                <input className="input" value={g.fullName} onChange={(e) => update(i, { fullName: e.target.value })} autoComplete={isLead ? 'name' : 'off'} />
              </Field>

              <div>
                <span className="label">{t.livesInJapan} *</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['yes', 'no'] as const).map((v) => (
                    <button
                      type="button"
                      key={v}
                      onClick={() => update(i, { livesInJapan: v })}
                      className={`rounded-lg border px-3 py-2.5 font-medium ${g.livesInJapan === v ? 'border-sea bg-sea-light text-sea' : 'border-stone-300 bg-white'}`}
                    >
                      {t[v]}
                    </button>
                  ))}
                </div>
              </div>

              {g.livesInJapan === 'no' && (
                <>
                  <Field label={t.nationality}>
                    <input className="input" value={g.nationality} onChange={(e) => update(i, { nationality: e.target.value })} autoComplete="country-name" />
                  </Field>
                  <Field label={t.passportNo}>
                    <input className="input uppercase" value={g.passportNo} onChange={(e) => update(i, { passportNo: e.target.value })} autoCapitalize="characters" />
                  </Field>
                  <div>
                    <span className="label">{t.passportPhoto} *</span>
                    <p className="mb-2 text-xs text-stone-500">{t.passportHint}</p>
                    {g.preview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.preview} alt="" className="mb-2 max-h-56 w-full rounded-lg object-contain ring-1 ring-stone-200" />
                    )}
                    <label className="btn-ghost w-full cursor-pointer">
                      📷 {g.preview ? t.changePhoto : t.choosePhoto}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(i, e.target.files?.[0])} />
                    </label>
                  </div>
                </>
              )}

              {g.livesInJapan && (
                <>
                  <Field label={g.livesInJapan === 'yes' ? t.addressJp : t.homeAddress}>
                    <textarea className="input" rows={2} value={g.address} onChange={(e) => update(i, { address: e.target.value })} />
                  </Field>
                  <Field label={t.occupation}>
                    <input className="input" value={g.occupation} onChange={(e) => update(i, { occupation: e.target.value })} />
                  </Field>
                </>
              )}

              {isLead && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t.phone}>
                    <input className="input" type="tel" value={g.phone} onChange={(e) => update(i, { phone: e.target.value })} autoComplete="tel" />
                  </Field>
                  <Field label={t.email}>
                    <input className="input" type="email" value={g.email} onChange={(e) => update(i, { email: e.target.value })} autoComplete="email" />
                  </Field>
                </div>
              )}
            </fieldset>
          );
        })}

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-sea" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{t.consent}</span>
        </label>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <button type="submit" className="btn w-full py-3 text-lg" disabled={status === 'sending'}>
          {status === 'sending' ? progress : t.submit}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label} *</span>
      {children}
    </label>
  );
}
