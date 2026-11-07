import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Logins come from the ADMIN_ACCOUNTS env var, e.g.
// [{"user":"chris","password":"…","houses":["*"]},{"user":"ken","password":"…","houses":["hayama"]}]
// "houses" lists the house ids (from the Houses tab) that person can see; "*" means all.
type Account = { user: string; password: string; houses: string[] };
export type Admin = { user: string; houses: string[] };

const COOKIE = 'admin_session';
const DAYS = 30;

function accounts(): Account[] {
  let list: unknown;
  try {
    list = JSON.parse(process.env.ADMIN_ACCOUNTS || '[]');
  } catch {
    throw new Error('ADMIN_ACCOUNTS is not valid JSON');
  }
  return Array.isArray(list) ? list.filter((a) => a?.user && a?.password && Array.isArray(a.houses)) : [];
}

// Changing any password changes the secret, which logs everyone out.
function secret() {
  const raw = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_ACCOUNTS;
  if (!raw) throw new Error('ADMIN_ACCOUNTS is not set');
  return createHash('sha256').update(raw).digest();
}
const sign = (v: string) => createHmac('sha256', secret()).update(v).digest('base64url');
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkLogin(user: string, password: string) {
  const acct = accounts().find((a) => a.user.toLowerCase() === user.trim().toLowerCase());
  // Compare HMACs so timing doesn't leak the password length.
  return acct && safeEqual(sign(password), sign(acct.password)) ? acct.user : null;
}

export function startSession(user: string) {
  const payload = `${Buffer.from(user).toString('base64url')}.${Date.now() + DAYS * 86400_000}`;
  cookies().set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DAYS * 86400,
  });
}

export function endSession() {
  cookies().delete(COOKIE);
}

export function getAdmin(): Admin | null {
  const v = cookies().get(COOKIE)?.value;
  if (!v) return null;
  const [u, exp, sig] = v.split('.');
  if (!u || !exp || !sig || !safeEqual(sig, sign(`${u}.${exp}`)) || Number(exp) < Date.now()) return null;
  const user = Buffer.from(u, 'base64url').toString();
  const acct = accounts().find((a) => a.user === user);
  return acct ? { user: acct.user, houses: acct.houses } : null;
}

export function requireAdmin(): Admin {
  const a = getAdmin();
  if (!a) redirect('/admin/login');
  return a;
}

export function canSee(admin: Admin, houseId: string) {
  return admin.houses.includes('*') || admin.houses.includes(houseId);
}
