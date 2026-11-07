import 'server-only';
import { headers } from 'next/headers';

export function baseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const h = headers();
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
}
