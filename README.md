# FundedXYZ BD / Affiliate Sales Dashboard

Role-scoped sales tracking for FundedXYZ business development. Admins see everything; BDs see only their own
affiliates and team totals; affiliates see only their own referred sales and commission. **All role scoping is
enforced server-side** (never hidden only in the UI).

## Stack
- Node.js (>=22) + Express. Zero native deps: SQLite via built-in `node:sqlite`, password hashing via built-in
  `crypto.scrypt`, sessions via signed HttpOnly cookies (HMAC-SHA256).
- Single-file dark UI (FundedXYZ cyan/lime), Chart.js (CDN). Mobile-friendly. No emoji.

## Roles
- **admin** (David, Khong Ming) — all sales, all BDs, all affiliates, totals, user/affiliate/commission management, import.
- **bd** — only their own affiliates + those affiliates' sales + their team total + BD commission.
- **affiliate** — only their own referred sales + own commission.

## Views
Totals (Today / 7D / MTD / All-time), sales-over-time chart, BD + affiliate leaderboards, per-affiliate table
(code, sign-ups, sales count, revenue, commission, rate, last sale), product breakdown, scoped CSV export.
Admin: create users (temp password returned), create BDs/affiliates, assign affiliates to BDs, set commission %,
run data import.

## Run locally
```bash
npm install
cp .env.example .env            # set SESSION_SECRET (openssl rand -hex 32)
node src/seed.js                # creates admins + sample data; writes temp passwords to ../secrets/
npm start                       # http://localhost:8080
```
Admin logins are seeded for David & Khong Ming (temp passwords in `secrets/bd-dashboard-admin.txt`, chmod 600,
must-change-on-first-login). Sample BD/affiliate logins are seeded for role testing.

## Data source
See **BACKEND_REQUIREMENTS.md**. Default `DATA_ADAPTER=sample` (seeded demo). `DATA_ADAPTER=sheet` imports a
Google-Sheet/CSV export. A live `ApiAdapter` slots into `src/adapter.js` with the same `importAll()` contract.

## Deploy (GitHub → host; never hand-edit prod)
- **DigitalOcean App Platform**: push to `main`; App Platform builds from `.do/app.yaml` (health check `/health`).
  Set env `SESSION_SECRET`, `TRUST_PROXY=true`, and a persistent volume / managed DB path for `data/`.
- **Droplet + Caddy**: `docker build` (see Dockerfile) or `node server.js` under systemd/PM2 on an internal port,
  reverse-proxied by Caddy for TLS (see `deploy/Caddyfile.snippet`). Mount `data/` on a persistent path.
- Suggested subdomain: `bd.fundedxyz.com` or `bd.unitycrypto.com` (add DNS yourself — the app doesn't touch DNS).

## Security
- Passwords: scrypt-hashed, never stored plaintext, never logged. No shared passwords.
- Sessions: signed HttpOnly SameSite=Lax cookie, 12h expiry, `Secure` when `TRUST_PROXY=true`.
- Role scoping enforced in SQL (`src/scope.js`) on every data query; admin-only routes gated server-side.
- CSP + X-Frame-Options DENY + nosniff.
