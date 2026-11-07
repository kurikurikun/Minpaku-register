import 'server-only';

// Talks to the Google Apps Script in apps-script/Code.gs, which reads/writes
// your Google Sheet and Drive folder and sends email from your Gmail.
async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url || !secret) throw new Error('APPS_SCRIPT_URL / APPS_SCRIPT_SECRET are not set (see README)');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ secret, action, ...payload }),
    cache: 'no-store',
    redirect: 'follow',
  });
  const body = await res.text();
  let data: { ok: boolean; result: T; error?: string };
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Apps Script returned an unexpected response (${res.status}): ${body.slice(0, 200)}`);
  }
  if (!data.ok) throw new Error(`Apps Script error: ${data.error}`);
  return data.result;
}

export type Row = Record<string, string>;

export const store = {
  ensure: (schema: Record<string, readonly string[]>, seed: Record<string, Row[]>) => call<true>('ensure', { schema, seed }),
  read: (tabs: string[]) => call<Record<string, Row[]>>('read', { tabs }),
  append: (tab: string, row: Record<string, string | number>) => call<true>('append', { tab, row }),
  upload: (name: string, mimeType: string, data: Buffer) =>
    call<{ id: string; url: string }>('upload', { name, mimeType, base64: data.toString('base64') }),
  download: async (id: string) => {
    const r = await call<{ base64: string; mimeType: string }>('download', { id });
    return { data: Buffer.from(r.base64, 'base64'), mimeType: r.mimeType };
  },
  mail: (to: string, subject: string, body: string) => call<true>('mail', { to, subject, body }),
};
