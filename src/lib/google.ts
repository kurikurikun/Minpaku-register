import 'server-only';
import { google } from 'googleapis';
import { Readable } from 'node:stream';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];

// Two ways to connect:
// 1. OAuth refresh token for your own Google account (works with any Google account).
// 2. Service account JSON (needs a Shared Drive for photo uploads, because service accounts have no storage quota).
function getAuth() {
  if (process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    const client = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    return client;
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Google credentials are not configured (see README).');
  const key = JSON.parse(raw);
  return new google.auth.JWT({ email: key.client_email, key: key.private_key, scopes: SCOPES });
}

let cached: ReturnType<typeof build> | null = null;
function build() {
  const auth = getAuth();
  return { sheets: google.sheets({ version: 'v4', auth }), drive: google.drive({ version: 'v3', auth }) };
}
export function gapi() {
  if (!cached) cached = build();
  return cached;
}

export function sheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID is not set');
  return id;
}

export async function uploadPhoto(name: string, mimeType: string, data: Buffer) {
  const folder = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folder) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set');
  const res = await gapi().drive.files.create({
    requestBody: { name, parents: [folder], mimeType },
    media: { mimeType, body: Readable.from(data) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  return { id: res.data.id!, url: res.data.webViewLink ?? `https://drive.google.com/file/d/${res.data.id}/view` };
}

export async function downloadPhoto(fileId: string) {
  const res = await gapi().drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data as ArrayBuffer);
}
