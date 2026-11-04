# ProneBridge

Get paid across Africa. One checkout for every African market, with PayPal and AI behind it.

Built by [Prone Data](https://pronedata.com) for the PayPal AI Hackathon.

## The idea

Sellers collect from buyers across African countries without a company in each one. Buyers pay with the methods they already use. PayPal is the global rail. AI helps sellers sell and helps stop fraud.

## Real and simulated

Everything simulated is labeled in the app and listed here.

- PayPal runs in the PayPal sandbox. No real money moves. Card and PayPal payments, and the payouts to a seller, go through it.
- Local payment methods, such as mobile money and bank transfer, are simulations with prefilled test data. The app says so wherever they appear.
- Payouts of local sales and of the demo history are simulated too.
- Exchange rates for local prices are indicative and simulated.
- The demo data is invented: five fictional merchants, their courses, buyers, prices, fees and ninety days of traffic.
- No bank, wallet or payment company is integrated, and none is named as a partner.
- A buyer's country, name and nationality are never used to judge risk.

## Status

Step 5 of 10: PayPal. The checkout takes card and PayPal payments in the PayPal sandbox, settles them from PayPal's verified webhooks, and pays sellers with PayPal Payouts. The dashboards and the AI arrive step by step.

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
- Card and PayPal run in the PayPal sandbox and charge in US dollars, because PayPal takes no African currency. They show as "Soon" until PayPal is connected. Their demo control can approve or decline.
- When a payment succeeds, the buyer gets a notification, the course unlocks, and the Seller tab gets a "New sale".
- Every attempt carries an idempotency key, so a retry never charges twice.

### Large screens

From a 32 inch monitor to a 64 inch screen, the whole interface (type, spacing, icons, charts, the grid) is scaled up in steps, and the content spreads a little wider. The steps follow the window in CSS pixels, so they already count the system's display scaling. A laptop and a phone are not scaled. The steps are in `client/src/styles/base.css`.

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

## PayPal

Everything runs in the PayPal sandbox. The app never calls live PayPal.

How a payment goes:

1. The buyer picks card or PayPal. The page loads PayPal's JavaScript SDK v6 and a short lived client token from the server, never the secret.
2. Pressing the button makes the payment and a PayPal order on the server. The price comes from the database, never from the browser.
3. PayPal draws its own button or card fields. Card numbers go to PayPal, never to this app.
4. When the buyer approves, the server captures the order and settles the payment: the course unlocks and both sides are told.
5. PayPal's webhook says the same thing again. It is verified by PayPal, written once by its event id, and settles nothing twice.

Set it up:

1. In the [PayPal developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox), create a sandbox app. Put its client ID and secret in `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
2. For card payments, open the app, then Features, and switch on Advanced Credit and Debit Card Payments.
3. To send real sandbox payouts, put the email of a sandbox account in `PAYPAL_PAYOUT_EMAIL`. Without it, payouts stay simulated.
4. Webhooks need a public HTTPS address, so this is done once the app is deployed. In the app, open Webhooks and add `https://your-domain/api/webhooks/paypal` with these events: Checkout order approved, Payment capture completed, declined, denied, pending, refunded and reversed, and Payments payout batch and payout item events. Copy the Webhook ID into `PAYPAL_WEBHOOK_ID`. Without a webhook, the capture answer still settles every payment, so the demo works locally.

Test with PayPal's published sandbox card `4012 8888 8888 1881`, any future date and any three digits. The demo control on the checkout can decline a payment on demand.

Paying sellers: `POST /api/payouts/run` pays out the paid sales no payout covers yet. Genuine PayPal sales go to the seller in one PayPal Payouts batch. Everything else, the local methods and the demo history, is paid out in simulation only and labeled so. The payout's reference is the batch id sent to PayPal, so a retry is the same payout, never a second one. The seller dashboard gets a button for it in step 6.

There is no sign-in in this demo, so these routes are open. They only ever touch the sandbox.

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
