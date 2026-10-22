# What the FundedXYZ backend must expose to make this dashboard LIVE

Current state: the real per-order affiliate attribution lives in the **FundedXYZ platform backend**
(the system behind `https://www.fundedxyz.com/register?referral=<id>` and checkout/promo codes such as
`XYZCUPB1F1` / `XMODEB1F1`). That data is **not reachable read-only** from our infrastructure yet.
The `api.unitycrypto.com` Cloudflare Worker + Google Sheet only exposes marketing stats
(aggregate withdrawals / leaderboard / totals), not per-order affiliate attribution.

So today the dashboard runs on **seeded sample data** (DATA_ADAPTER=sample) and ships a **CSV/Google-Sheet
import adapter** (DATA_ADAPTER=sheet) so it works immediately. To go live with real data, Khong Ming's
backend needs to expose ONE of the following.

## Option A — read-only REST endpoint (preferred)
`GET https://<backend>/api/affiliate-sales?since=YYYY-MM-DD`  (protected by an API key header)

Return JSON array of orders:
```json
[{
  "order_id": "ORD123456",          // unique, stable  (REQUIRED - idempotent key)
  "date": "2026-10-21T08:30:00Z",   // ISO timestamp   (REQUIRED)
  "referral_code": "XYZCUPB1F1",    // promo/affiliate code on the order
  "referral_id": "9799611",         // platform referral id (register?referral=)
  "amount": 399.00,                 // gross USD        (REQUIRED)
  "currency": "USD",
  "product": "100K Account - Z Mode Hard",
  "account_size": "100000",
  "mode": "Z Mode - Hard",
  "status": "paid",                 // paid | pending | refunded
  "customer_email": "cust@example.com"
}]
```
At least ONE of `referral_code` / `referral_id` must be present to attribute a sale to an affiliate.

Optionally a sign-ups endpoint:
`GET /api/affiliate-signups?since=` → `[{ "id","date","referral_code","referral_id","email" }]`

Implement as a new `ApiAdapter` in `src/adapter.js` with the same `importAll()` signature, set `DATA_ADAPTER=api`.

## Option B — Google Sheet / CSV export (works today, no backend code)
Publish a sheet/CSV with these column headers (case-insensitive, spaces→underscores):

`order_id, date, referral_code, referral_id, amount, product, account_size, mode, status, customer_email`

Then set `DATA_ADAPTER=sheet` and `SALES_CSV_URL=<published CSV url>`, and Admin → "Run import now"
(or set `IMPORT_INTERVAL_MIN` for auto-refresh). Affiliate records are auto-created from `referral_code`;
an admin then assigns each to a BD and sets commission %.

## Mapping notes
- Affiliate = a `referral_code` (and/or `referral_id`). Admin assigns affiliates to BDs and sets commission %.
- Revenue = SUM(amount) WHERE status='paid'. Refunds excluded from revenue, still importable.
- Commission (affiliate) = amount x affiliate.commission_pct. Commission (BD) = team revenue x bd.commission_pct.
