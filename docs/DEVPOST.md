# Devpost text

Paste each block into the field of the same name. Every sentence is true of the build today. Anything simulated says so. Read the Rules tab of the hackathon page once more before you submit, since the page did not load for me.

## Project name

ProneBridge

## Tagline

One checkout for every African market.

## Elevator pitch

Sell across Africa without a company in each country. Buyers pay the way they already do, PayPal moves the money, and AI helps sellers sell and keeps the network safe and fair.

## About the project

### Inspiration

Selling to Africa online still means one account, one integration and one currency per country. Buyers pay with mobile money, bank transfer, USSD and cash vouchers, and a card form fits only some of them. Sellers lose buyers at checkout, and every extra country means an extra setup.

We are Prone Data, a small team with roots in Guinea and Cameroon, based in France. We wanted one layer between the seller and the continent. PayPal is the rail the whole world already trusts. AI is what makes the layer smart enough to run itself.

### What it does

ProneBridge is one app with three tabs, like a browser: Buyer, Seller and Admin. They update each other live.

**Buyer.** A storefront and a checkout. The buyer picks a country, and the price, the currency and the payment methods follow. Method Match puts the method most likely to work first, with its numbers.

**Seller.** A dashboard of every payment, customer, payout, payment link and country. A copilot answers questions about the business in plain words, and prepares changes that happen only when the seller confirms them.

**Admin.** The view of the whole network. Every payment gets a risk rating before any money moves. Low goes through, medium waits for a person, high is blocked, and everyone who needs to know is told. The admin also marks payment corridors working, slow or down, and sees a fairness page that proves country never decides risk.

**The demo director.** Eight one-click scenarios, from a sale to a card testing attack to a mobile money outage, run through the same checkout, rules and notifications as a real payment. A reset writes fresh demo history.

### How it uses PayPal

PayPal is the payment rail, and the demo runs in the PayPal sandbox.

- Card and PayPal payments use the JavaScript SDK v6. PayPal draws its own button and card fields, so card numbers go to PayPal and never to our server.
- Orders v2 on the server. The price comes from the database, never from the browser. The server captures the order and settles the payment.
- Payouts to sellers in one batch, safe to retry, so a retry is never a second payout.
- Webhooks, verified by PayPal itself and written once by event id, so nothing settles twice.

### How it uses AI

The AI is real and live, on OpenAI's Responses API. It has two jobs, and a strict limit on both.

- **The seller copilot** (`gpt-6.1-sol`) has twelve tools. It reads the seller's own data, so every number comes from the database. It can prepare a change, such as turning a payment method on or making a payment link. A change is only saved as a proposal, written in words by the server. It happens when the seller presses Confirm, and it expires after fifteen minutes. It cannot refund, delete or edit a price.
- **Notes on held payments** (`gpt-6-luna`). The rules score the payment. The AI writes one or two plain sentences from what the rules found. It is never told a name, an email or a country, and the rules' own sentence stands if the AI is off, slow or over budget.

The rules decide. The AI explains and assists. A daily token budget and rate limits keep it from running away with cost.

### How we built it

One npm package. React 19 and Vite on the front, with AG Grid Community for the tables. A Hono API in layers (routes, controllers, services, repositories) that runs unchanged as a Vercel function, on Node or in Docker. Supabase Postgres with row level security on every table, and Supabase Realtime for the live signals, which carry ids and nothing else.

We tested it like a product. 1,310 tests run on a real Postgres in memory, including end to end journeys through the real app and the real API, a fairness experiment, and a security suite. A strict Content Security Policy was checked in a real browser against the PayPal SDK.

### Challenges we ran into

**An honest demo.** Local payment methods are simulated, and so is the data. We labeled every simulated thing in the app and the README, and we never name a bank, wallet or payment company as a partner.

**Fairness.** A fraud engine that quietly learns that one country is riskier is a harm, not a feature. So country is not an input at all. The engine takes a closed list of signals and refuses anything else with an error. A test shuffles every buyer's country across the history and requires that not one score moves, and a control proves the test would notice if it could.

**An AI that can act.** The copilot can change a seller's setup, so it never does so on its own. It proposes, the server writes the proposal in plain words, and a person confirms.

**A policy that is strict.** The browser check caught our own theme script being blocked by the Content Security Policy. We moved it into a file instead of loosening the policy.

### Accomplishments we are proud of

- A fraud engine that cannot use country, name or nationality, and tests that fail the build if one gets through.
- A copilot that is useful and cannot hurt anyone: every number from the database, every change confirmed.
- A demo director that runs real traffic, including an attack, through the real pipeline.
- No blank page anywhere: every page has loading, empty and error states, and a brand new empty database opens cleanly.

### What we learned

Trust is the product. A seller trusts a number because it came from the database, a buyer trusts a checkout that explains itself, and a judge trusts a demo that says what is real. Most of the work was making each of those true and provable.

### What is next

Sign-in and roles, so each seller reaches only its own data. Real local payment rails, through licensed providers, behind the same checkout. PayPal in live mode once those exist. More countries, and Method Match learning from real results instead of demo data.

## Built with

react, vite, javascript, node.js, hono, zod, postgresql, supabase, supabase-realtime, paypal, paypal-sdk, openai, ag-grid, zustand, vitest, vercel, docker

## Try it out

Add these links before you submit.

- Live demo: the Vercel address
- Code: the public GitHub repository
- Video: the YouTube link

## Notes for judges

There is no sign-in. Open the app and press **Demo** in the toolbar.

1. Run **A sale**, then open the Seller tab. The payment is there.
2. Run **A suspicious buyer**. Open Admin, then Risk review, and approve or reject it.
3. Run **Mobile money outage** and watch the checkout lose the method.
4. In Seller, open Copilot, ask a question, and confirm a change.
5. To pay with a card, use PayPal's sandbox test card `4012 8888 8888 1881`, any future date and any three digits. To pay with PayPal itself, use a PayPal sandbox buyer account.

No real money moves anywhere. Local payment methods, exchange rates and all demo data are simulated, and the app labels each one.

## Before you submit

1. Deploy to Vercel, add the variables from `.env.example`, and run the migrations and the seed once.
2. Add the PayPal webhook with its Webhook ID, and a sandbox account for payouts. Then check by hand, on the deployed app: a card payment, a PayPal approval, a webhook and a payout.
3. Run the history scan again right before the repository goes public.
4. Press Reset in the Demo panel on the deployed app, so the charts are full.
5. Put the video on YouTube, public, under three minutes.
6. Upload the architecture image, `docs/architecture.png`, and a few screenshots to the gallery.
7. Read the Rules tab once more.
