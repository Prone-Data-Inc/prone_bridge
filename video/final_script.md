# The film

The finished demo film is `video/out/ProneBridge-demo.mp4`: 2 minutes 46 seconds, 1920 by 1080, 30 frames a second, with burned in captions, and `ProneBridge-demo.srt` for YouTube. The voice is ElevenLabs (Mike, warm, neutral and professional, model v4), sped up 5 percent. The music bed is an instrumental made with ElevenLabs.

## What is said

Each scene lasts exactly as long as its sentences, so picture and voice cannot drift.

| Scene        | Narration                                                                                                                                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Map          | PayPal, Visa and Mastercard move money all around the world. In Europe, the Americas and Asia, buyers pay in a single click. Then look at Africa. Fifty-four countries, more than a billion people, and many of them pay with mobile money and cash. A card form alone misses them. |
| Problem      | We created Prone Data Learning to bring AI and automation skills across the African continent. And we hit the wall every seller hits here. One payment integration, for every single country.                                                                                       |
| ProneBridge  | That is why we built ProneBridge. One checkout that accepts world payments, like PayPal, Visa and Mastercard, and local ones, like mobile money, bank transfer and USSD. For any vendor. Online shops, learning platforms, software. In this demo, local methods are simulated.     |
| Buyer        | The buyer picks a country. The price, the currency and the payment methods follow. Method Match puts the one most likely to work first. PayPal and cards run through the PayPal sandbox. Local methods are simulated, like this one. And the course unlocks.                        |
| Seller       | The seller sees the sale the second it happens. Volume, customers, payment links, payouts. One tap, and the payout is on its way.                                                                                                                                                   |
| Admin        | The admin sees the whole network. Every payment is scored before money moves. Low goes through. Medium waits for a person. High is blocked at once. And country is never a signal. The engine refuses it.                                                                           |
| Copilot      | Then, AI changes the game. A copilot that reads the seller's own data, answers in plain words, and prepares changes, like a payment link. Nothing happens until the seller confirms.                                                                                                |
| Architecture | Under the hood, one API, three tabs, and three services behind it. PayPal for money. OpenAI for intelligence. Supabase for live data.                                                                                                                                               |
| PayPal       | PayPal is the global rail. Orders for card and PayPal payments. Payouts for sellers. Webhooks, verified by PayPal itself. Everything settles in US dollars, so the diaspora and international buyers can pay a seller in Africa, with a method they already trust.                  |
| AI           | And OpenAI writes the words. The copilot, with twelve strict tools, and a plain note on every held payment. The rules decide. The AI explains. It never decides.                                                                                                                    |
| Close        | ProneBridge goes after the biggest bottleneck of selling in Africa. Payments. Built with PayPal, and OpenAI. Thank you.                                                                                                                                                             |

## What changed from the first script, and why

- **No operator names.** The first script named Orange Money, Moov and MTN Mobile Money as accepted payments. ProneBridge does not integrate any of them, and the project rule is never to imply that. The film says mobile money, bank transfer and USSD, and says out loud that local methods are simulated.
- **No "no payment integrator exists".** Other providers exist, so an absolute claim is easy to challenge in front of PayPal. The film says what is true for a seller: one integration for every country.
- **The risk flow is told as the app does it.** Low goes through, medium waits for a person, high is blocked at once, and the rules decide, never the AI.
- **More about PayPal and the AI.** PayPal gets its own scene with the real Orders, Payouts and webhook code. The AI gets the copilot (twelve strict tools, every change confirmed), the notes on held payments and the prompt that keeps it to explaining.
- **The payout line.** The film says "the payout is on its way", since local payouts are simulated and PayPal pays out only the PayPal sales.
- **The purchase uses a local method.** The PayPal sandbox app does not have card payments switched on yet, so the film shows PayPal's own button and card fields live, and completes the purchase with a local method. Switch on Advanced Credit and Debit Card Payments in the PayPal developer dashboard, then record again for a card payment.

## What is on screen

- **Map.** Country tiers are an estimate for illustration, and the picture says so. The data are public domain shapes (Natural Earth), colored by estimated card and PayPal use.
- **App footage.** The real app, recorded in Chrome against the real database, OpenAI and the PayPal sandbox. Demo data, labeled.
- **Code.** Real excerpts of this repository, taken line for line from `server/src/integrations/paypal/client.js`, `server/src/lib/copilot.js`, `server/src/lib/risk.js` and `server/src/services/risk.service.js`.
- **Architecture.** `docs/architecture.svg`.
- **Close.** Thank you, in the ProneBridge colors with their codes.
