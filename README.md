# ProneBridge

Get paid across Africa. One checkout for every African market, with PayPal and AI behind it.

Built by [Prone Data](https://pronedata.com) for the PayPal AI Hackathon.

## The idea

Sellers collect from buyers across African countries without a company in each one. Buyers pay with the methods they already use. PayPal is the global rail. AI helps sellers sell and helps stop fraud.

## Real and simulated

Everything simulated is labeled in the app and listed here.

- PayPal runs in the PayPal sandbox. No real money moves.
- Local payment methods, such as mobile money and bank transfer, are simulations with prefilled test data. The app says so wherever they appear.
- Exchange rates for local prices are indicative and simulated.
- The demo data is invented: five fictional merchants, their courses, buyers, prices, fees and ninety days of traffic.
- No bank, wallet or payment company is integrated, and none is named as a partner.
- A buyer's country, name and nationality are never used to judge risk.

## Status

Step 4 of 10: the buyer. The storefront and the checkout work end to end with simulated local methods. Card and PayPal, the dashboards and the AI arrive step by step.

## The app

One window with three fixed tabs, like a browser: **Buyer**, **Seller** and **Admin**. They are the three roles of the demo, and they update each other live. A number on a tab means something happened there, and a toast says what.

- The bell in the toolbar shows the notifications of the open tab.
- Notifications arrive through Supabase Realtime. If live updates are blocked, the app checks again every twenty seconds.
- Light and dark themes, from the toolbar. The theme follows the system until you choose one.
- Every page has a link, such as `#/seller/payments`, so the back button works.

### The buyer

The Buyer tab is the storefront of Prone Data Learning, the demo seller, in its own green. Pressing Buy opens the ProneBridge checkout, in blue.

- The buyer picks a country. The price, the currency and the payment methods follow it.
- Local methods are simulated. A demo control lets you approve, decline or time out each payment, so every ending can be shown.
- When a payment succeeds, the buyer gets a notification, the course unlocks, and the Seller tab gets a "New sale".
- Card and PayPal show as "Soon" until PayPal is connected.
- Every attempt carries an idempotency key, so a retry never charges twice.

The design system, with every color, component and chart, is at `#/ui`. Long lists use [AG Grid](https://www.ag-grid.com) Community, themed with the same tokens.

## Run it

You need Node 22.13 or newer.

```bash
npm install
npm run dev
```

The web app is on http://localhost:5173 and the API on http://localhost:8000/api/health.

Settings live in a `.env` file. Copy `.env.example` to `.env` and fill in what each step asks for.

## The database

ProneBridge keeps its data in Supabase (Postgres).

1. Create a Supabase project and copy its connection string into `DATABASE_URL` in `.env`.
2. Download the project's CA certificate (Project settings, Database, SSL configuration) and save it as `certs/supabase-ca.crt`. The connection is always verified.
3. Put the project URL and the **anon** key in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never put the service role key anywhere in this app. The build stops if it finds one in a `VITE_` variable.
4. Run:

```bash
npm run db:migrate
npm run db:seed
npm run db:check
```

`db:check` proves the project is ready: the connection is verified, every table has row level security, the public data API returns nothing, and a change reaches the browser as a live signal.

Live updates travel as small signals on a public channel. They carry ids and a status, never a name, an email or an amount.

On Vercel, use the transaction pooler connection string for `DATABASE_URL` and paste the certificate text into `DATABASE_SSL_CA`.

## Run it with Docker

```bash
docker compose up --build
```

The app is then on http://localhost:8000.

## Deploy on Vercel

Import the repository. `vercel.json` does the rest: the web app is built to `client/dist` and the API runs as one function, `api/index.js`. Add the variables from `.env.example` in the project settings.

## Scripts

| Command                | What it does                                             |
| ---------------------- | -------------------------------------------------------- |
| `npm run dev`          | API and web app together, with live reload               |
| `npm run build`        | Builds the web app                                       |
| `npm start`            | Runs the API, and the built app when `SERVE_CLIENT=true` |
| `npm test`             | Runs every test                                          |
| `npm run lint`         | Checks the code                                          |
| `npm run check`        | Lint, format, tests, build and secret scan               |
| `npm run brand`        | Regenerates the logo, icons and social card              |
| `npm run db:migrate`   | Applies the database migrations                          |
| `npm run db:seed`      | Writes the demo data into an empty database              |
| `npm run db:reset`     | Erases and reseeds (add `-- --yes` to confirm)           |
| `npm run db:check`     | Checks a Supabase project end to end                     |
| `npm run scan:secrets` | Looks for keys in the files                              |
| `npm run scan:history` | Looks for keys in every commit                           |

## How it is built

```
api/       Vercel entry, one function for the whole API
client/    React web app (Vite): shell, ui kit, charts, stores
server/    API on Hono, in layers: routes, controllers, services, repositories
           db/migrations holds the SQL, src/db the migration runner and the seed
shared/    Brand, money and key checks used by both sides
brand/     Logo and icon generator
scripts/   Secret scanner and git hooks
```

The API is one web-standard app (`server/src/app.js`). Vercel, Node and Docker all run the same code.

## Keys and safety

Keys live in environment variables only. `.env` is never committed. A pre-commit hook scans every commit for secrets, and `npm run scan:history` checks the whole history.

Every table has row level security and no policy, so Supabase's public data API returns nothing. Only the API server reads and writes, through its own database connection.

## License

[MIT](LICENSE)
