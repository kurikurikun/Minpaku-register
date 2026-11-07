# Minpaku Guest Check-in

Online guest registration (宿泊者名簿) for minpaku houses, built to meet the
住宅宿泊事業法 requirements: every guest's name, address, and occupation, plus
nationality, passport number, and a passport copy for guests who don't live in Japan.

- **Guests** get a personal link per booking, fill in every person in their party
  on their phone (English / 日本語 / 中文 / 한국어), and photograph their passports.
- **You** log in at `/admin` to create bookings, copy a ready-made EN/JA message
  with the link, see who's registered (with passport photos), and print or download
  the register by house and date range.
- **Data** lives in your Google Workspace: one Google Sheet (tabs `Houses`,
  `Bookings`, `Guests`, created automatically) and one Drive folder for passport photos.
- **Email alert** to you when every guest in a booking has registered.

## Houses

Edit the `Houses` tab in the Sheet. It's seeded with `hayama` / Hayama Retreat and
`house2` / House 2. Change the names, or add rows for more houses. Keep the `id`
column unchanged once there are bookings.

## Setup (about 15 minutes, one time)

### 1. Shared Drive, Sheet, and folder
1. In Google Drive, create a new **Shared Drive**, e.g. `Minpaku Guest Register`.
   Keep membership to yourself (and co-hosts only). It holds passport copies.
2. Inside it, create a blank Google Sheet (`Guest Register`) and a folder (`Passports`).
3. Copy the Sheet ID and the folder ID from their URLs.

### 2. Google service account
1. Go to <https://console.cloud.google.com>, create a project (e.g. `minpaku-checkin`).
2. **APIs & Services → Library**: enable **Google Sheets API** and **Google Drive API**.
3. **IAM & Admin → Service Accounts → Create**. Name it `checkin`. No roles needed.
4. Open it → **Keys → Add key → JSON**. A `.json` file downloads.
5. Back in the Shared Drive → **Manage members**: add the service account's email
   (`checkin@<project>.iam.gserviceaccount.com`) as **Content manager**.

> If your org blocks service-account key creation, use option B (OAuth) in `.env.example`.

### 3. Deploy on Vercel
1. Import this repo in Vercel (New Project).
2. Add the environment variables from `.env.example`. For
   `GOOGLE_SERVICE_ACCOUNT_JSON`, paste the entire contents of the JSON key file.
3. Deploy, then open `https://<your-app>/admin` and log in.

### 4. Email alerts (optional)
Create a free account at <https://resend.com>, verify your domain, and set
`RESEND_API_KEY`, `OWNER_EMAIL`, `EMAIL_FROM`.

## Day-to-day
1. New booking → `/admin` → pick house, dates, number of guests → **Create check-in link**.
2. Copy the EN or JA message and send it via Airbnb / Booking.com / email.
3. Status shows `1/3`, `3/3 ✓`. You get an email when it's complete.
4. For inspections: **Register 名簿** → filter → **Print / Save PDF** or **Download CSV**.

## Legal notes
- Records must be kept for **3 years** — don't delete rows or photos before then.
- The law also requires **identity verification** (face-to-face, or by video/tablet
  at check-in) that the guest matches the passport. This app collects the data; it
  doesn't replace that check.
- Links stop working 7 days after check-out, and once all guests have registered.
  To fix a mistake, edit the row in the Sheet.

## Development
```bash
cp .env.example .env.local   # fill in
npm install
npm run dev
```
