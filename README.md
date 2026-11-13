# Wake & Pay Kenya — Starter MVP

This starter contains:
- Admin dashboard UI (device list, activation status, fee settings, payment history)
- Supabase PostgreSQL schema with row-level security policies
- Node.js/Express backend scaffold
- Safe device-registration/activation workflow placeholders

## Important
This is a development starter, not a production-ready device-locking app.
A phone owner must knowingly install/register the app and consent to activation.
Do not use this to secretly enroll devices or prevent emergency access/device recovery.
The dashboard's activation controls are UI placeholders until authenticated admin APIs
are connected. M-Pesa payments are NOT live; Daraja credentials and callback validation
must be configured on a secure server before accepting money.

## 1. Install in Termux

```bash
pkg update -y
pkg install nodejs-lts git unzip -y
cd ~
unzip wake-pay-kenya.zip
cd wake-pay-kenya
```

If the zip is in your Android Downloads folder, first copy it into Termux:
```bash
termux-setup-storage
cp ~/storage/downloads/wake-pay-kenya.zip ~/
```

## 2. Run the dashboard

```bash
cd ~/wake-pay-kenya
npm install
npm run dev
```

Open `http://localhost:3000` in your phone browser.

## 3. Configure Supabase

1. Create a Supabase project.
2. Open SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. Add the project URL and anon key to `.env` only for the frontend if/when
   a frontend Supabase client is added. Never put a service-role key in browser code.
5. Set a secure admin role only from a trusted server-side process.

## 4. Backend environment

Copy `.env.example` to `.env` and fill in values:
```bash
cp .env.example .env
```

The server currently exposes health/status endpoints only. Device activation and
payment endpoints are intentionally not enabled until authentication, consent,
server-side authorization, and Daraja callback verification are implemented.

## 5. Planned next milestones

1. Supabase Auth + admin role enforcement.
2. Owner-confirmed device registration and consent records.
3. Secure device activation/deactivation API.
4. Safaricom Daraja sandbox STK Push and signed/validated callback handling.
5. Android app for alarms and owner-authorized kiosk/lock-task enrollment.

## Fee defaults in the demo
- Snooze: KSh 10
- Stop: KSh 50

These are editable demo values only; no payment is charged.
