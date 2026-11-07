import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE = 'admin_session';
const DAYS = 30;

function secret() {
  const s = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) throw new Error('ADMIN_PASSWORD is not set');
  return s;
}
function sign(v: string) {
  return createHmac('sha256', secret()).update(v).digest('base64url');
}
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(pw: string) {
  const real = process.env.ADMIN_PASSWORD;
  return !!real && safeEqual(sign(pw), sign(real));
}

export function startSession() {
  const exp = String(Date.now() + DAYS * 86400_000);
  cookies().set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DAYS * 86400,
  });
}

export function endSession() {
  cookies().delete(COOKIE);
}

export function isAdmin() {
  const v = cookies().get(COOKIE)?.value;
  if (!v) return false;
  const [exp, sig] = v.split('.');
  return !!exp && !!sig && safeEqual(sig, sign(exp)) && Number(exp) > Date.now();
}

export function requireAdmin() {
  if (!isAdmin()) redirect('/admin/login');
}
