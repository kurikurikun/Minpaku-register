import 'server-only';

// Sends via Resend (https://resend.com). Skipped silently if not configured.
export async function notifyOwner(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.OWNER_EMAIL;
  if (!key || !to) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Guest Check-in <onboarding@resend.dev>',
        to: to.split(',').map((s) => s.trim()),
        subject,
        text,
      }),
    });
    if (!res.ok) console.error('Email failed', res.status, await res.text());
  } catch (e) {
    console.error('Email failed', e);
  }
}
