# price-tracker

A fully-hosted price tracker: add products by name, it discovers sellers via
Google Shopping (SerpAPI), confirms the match with you once, then tracks the
best effective price (listed + shipping − rewards value) across sellers on a
schedule and emails you when it hits a meaningful new low.

## Stack

- **Next.js on Vercel** — serverless API routes + Vercel Cron, one deploy, no servers to manage.
- **Postgres via Neon** — managed, serverless-friendly, plain `pg` wire protocol (works with any Postgres host).
- **Drizzle ORM** — typed schema/migrations.
- **SerpAPI Google Shopping** — one API call returns a canonical product plus seller offers (price, seller, link, shipping, stock). A pluggable retailer-adapter fallback exists in `lib/discovery/retailer-fallback.ts` (empty by default) for sites SerpAPI doesn't cover.
- **Resend** — transactional email for the alert digest.

## Data model (`lib/db/schema.ts`)

- `products` — the search spec: name, search term, must-include/exclude keywords, optional UPC, expected price range, check interval, alert window/margin/cooldown.
- `product_confirmations` — the human-confirmed canonical identity (title/UPC/image) for a product. Nothing is tracked until this exists.
- `pending_matches` — discovery results awaiting confirmation.
- `seller_settings` — per-seller reward point valuation (`point_value_usd`) and earn rate (`points_per_dollar`).
- `price_history` — append-only; one row per matched seller offer per check run, with the computed effective price and `is_best` flag.
- `alerts` — records when/what we alerted on, for cooldown dedup.
- `match_issues` — products that failed to find a confident match on a given run.

## Matching / disambiguation

`lib/matching/index.ts`: if a confirmed UPC exists and an offer exposes a UPC, match on that. Otherwise: normalize the offer title, require every must-include keyword, reject any must-exclude keyword, and reject if the listed price falls outside the configured min/max range. Offers that don't pass are excluded from history, never blended in.

## Effective price & alerts

`lib/pricing.ts`: `effective_price = listed_price + shipping − (rewards_points × point_value_usd)`. Best price = minimum effective price among in-stock offers. Alert fires when current best effective price is `<=` the trailing low (default 90-day window) **and** `<=` the prior reading minus a margin (default 3%), with a cooldown (default 24h) to avoid repeat emails. All of window/margin/cooldown are per-product columns.

## Deployment

1. Create a Neon Postgres database, copy its connection string.
2. Create a SerpAPI account/key (Google Shopping engine) and a Resend account/key + verified sender domain.
3. Push this repo to GitHub, import into Vercel.
4. In Vercel project settings → Environment Variables, set (see `.env.example`):
   - `DATABASE_URL`
   - `SERPAPI_API_KEY`
   - `RESEND_API_KEY`
   - `ALERT_EMAIL_TO`
   - `ALERT_EMAIL_FROM`
   - `CRON_SECRET` (any random string — Vercel Cron sends it automatically as a Bearer token)
5. Run migrations against the Neon database: `DATABASE_URL=... npx drizzle-kit push`.
6. Deploy. `vercel.json` registers the cron (`/api/cron/check-prices`, every 6 hours by default — edit the cron schedule string to change the global cadence; per-product `checkIntervalHours` is stored but the simplest cron just runs all active products each invocation, so set the cron schedule to your smallest desired interval).

## Adding a product and confirming the match

Visit `/admin` (your deployed URL). Fill in name, search term, must-include/exclude keywords, optional UPC, and expected price range, then submit. The app immediately runs discovery and shows you the canonical product and matched seller offers under "Pending matches." Click **"Yes, that's the product"** to confirm — only then does tracking/history begin. If a run later surfaces offers that don't match the confirmed identity, they're excluded automatically.

## Tuning rewards and the alert rule

- Point valuations/earn rates: `POST /api/admin/sellers` with `{ seller, pointValueUsd, pointsPerDollar }` (no UI form yet — use curl/Postman, or query `seller_settings` directly). Defaults: `pointValueUsd = 0.01`, `pointsPerDollar = 0` (no rewards unless configured).
- Alert rule: edit a product's `alertWindowDays`, `alertMarginPct`, `alertCooldownHours` at creation, or update the row directly. The rule itself lives in `lib/pricing.ts::evaluateAlertRule` if you want a different comparison than "trailing low AND margin below prior."

## Testing the alert path without waiting for a real price drop

1. Add and confirm a product as above (or seed one directly in the DB).
2. Seed fake history: `POST /api/admin/seed-history` with `{ productId, listedPrice, daysAgo }` to create an older, higher-priced reading (sets the trailing low / prior reading).
3. Either seed a second, lower-priced row the same way (`daysAgo: 0`), or click **"Run check now"** in `/admin` (calls `POST /api/admin/run-check`) to do a live discovery-backed check.
4. If the new reading is at/below the trailing low and beats the prior reading by the configured margin, a digest email is sent via Resend and an `alerts` row is recorded (cooldown prevents a duplicate the next run).

## Local development

```
npm install
DATABASE_URL=postgresql://... npx drizzle-kit push   # create schema
DATABASE_URL=postgresql://... npm run dev
```

Without `SERPAPI_API_KEY` set, discovery returns no results (logged, not crashed) — useful for exercising the admin UI and alert path with seeded history before wiring real keys.
