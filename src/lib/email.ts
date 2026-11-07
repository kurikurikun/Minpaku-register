import 'server-only';
import { store } from './store';

// Sent from your Gmail via the Apps Script. Goes to the house's notify_email
// (Houses tab), falling back to OWNER_EMAIL. Skipped if neither is set.
export async function notify(to: string | undefined, subject: string, body: string) {
  const recipient = (to || process.env.OWNER_EMAIL || '').trim();
  if (!recipient) return;
  try {
    await store.mail(recipient, subject, body);
  } catch (e) {
    console.error('Email failed', e);
  }
}
