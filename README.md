# Minpaku Guest Register

Online guest registration (宿泊者名簿) for minpaku houses, built for the
住宅宿泊事業法 requirements: every guest's name, address, and occupation, plus
nationality, passport number, and a passport copy for guests who don't live in Japan.

- **Guests** get a personal link per booking, fill in every person in their party
  on their phone (English / 日本語 / 中文 / 한국어), and photograph their passports.
- **Hosts** log in at `/admin` to create bookings, copy a ready-made EN/JA message
  with the link, see who's registered (with passport photos), and print or download
  the register by house and date range. Each login only sees its own house(s).
- **Data** lives in a personal Google account: one Google Sheet (tabs `Houses`,
  `Bookings`, `Guests`) and one private Drive folder for passport photos, reached
  through a small Apps Script (`apps-script/Code.gs`).
- **Email** from that Gmail account when every guest in a booking has registered.

## Setup (about 10 minutes, one time)

### 1. Apps Script (in the Google account that will hold the data)
1. Open <https://script.google.com> → **New project**. Name it `Minpaku Register`.
2. Delete the sample code, paste in all of [`apps-script/Code.gs`](apps-script/Code.gs), save.
3. In the toolbar, pick the **`setup`** function → **Run** → **Review permissions** →
   choose your account → *Advanced* → *Go to Minpaku Register (unsafe)* → **Allow**.
   (The warning appears because it's your own unpublished script.)
4. Open **Execution log**. It shows the new Sheet, the Passport folder, and
   `APPS_SCRIPT_SECRET`. Copy the secret.
5. **Deploy → New deployment** → gear icon → **Web app**.
   *Execute as:* **Me** · *Who has access:* **Anyone** → **Deploy** → copy the **Web app URL**.

"Anyone" only means the app can reach the script; every request must carry the
secret, and the Sheet and folder stay private to your account.

> If you edit `Code.gs` later: **Deploy → Manage deployments → Edit → Version: New version**,
> so the URL stays the same.

### 2. Deploy on Vercel
1. Vercel → **Add New → Project** → import `Minpaku-register`.
2. Add environment variables (see `.env.example`):
   - `APPS_SCRIPT_URL` — the Web app URL
   - `APPS_SCRIPT_SECRET` — the secret from the log
   - `ADMIN_ACCOUNTS` — the logins, e.g.
     `[{"user":"chris","password":"…","houses":["shinagawa"]},{"user":"friend","password":"…","houses":["hayama"]}]`
     Use `["*"]` for someone who should see every house.
   - `OWNER_EMAIL` — optional fallback for alert emails
3. **Deploy**, then open `https://<your-app>.vercel.app/admin`.

The Sheet's tabs are created on the first page load.

### 3. Houses
In the Sheet's `Houses` tab (seeded with `shinagawa` and `hayama`):
- `name` — shown to guests
- `photo_url` — photo at the top of the guest page. Paste an `https://` image link
  (e.g. long-press a photo on your Airbnb listing → *Copy image address*), or a Google
  Drive link to a photo shared as *Anyone with the link*.
- `notify_email` — who gets the "check-in complete" email for that house
- `address`, `license_no` (届出番号) — for your records

Add a row to add a house. Don't change an `id` once it has bookings.

## Day-to-day
1. New booking → `/admin` → house, dates, number of guests → **Create check-in link**.
2. Copy the EN or JA message and send it via Airbnb / Booking.com / email.
3. Status shows `1/3`, `3/3 ✓`; the house's notify email gets a message when complete.
4. For inspections: **Register 名簿** → filter → **Print / Save PDF** or **Download CSV**.

## Legal notes
- Keep records for **3 years** — don't delete rows or photos before then.
- The law also requires **identity verification** at check-in (face-to-face or by
  video/tablet) that the guest matches the passport. This app collects the data; it
  doesn't replace that check.
- Links stop working 7 days after check-out, or once all guests have registered.
  To fix a mistake, edit the row in the Sheet.
- All guests' data (both houses) sits in the one Google account. Hosts only see
  their own houses in the app, but the account owner can see everything in Drive.

## Development
```bash
cp .env.example .env.local   # fill in
npm install
npm run dev
```
