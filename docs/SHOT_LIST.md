# Shot list for the demo video

Length: 2 minutes 50 seconds. The limit is three minutes, so there are ten seconds of room. Format: 16:9, screen recording with a calm voice over, short captions, no talking head.

The product speaks for itself. Every shot is a real action in the real app. The director's panel makes each one repeatable, so any shot can be retaken.

## Before you record

1. Deploy, then press **Demo**, then **Reset the demo**. The charts fill with fresh history dated today. Wait one minute before the next reset.
2. Use the light theme. Switch to dark only for the last shot.
3. Make the browser window exactly 1920 by 1080 and set the zoom to 100 percent. The app scales itself on large monitors, so a window that is not 16:9 changes how it looks. Record one test take before shooting everything.
4. Open the **Seller** tab and the **Admin** tab once, then go back to **Buyer**. A tab that has been opened stays alive, so its toasts and badges arrive live.
5. Turn off system notifications. Hide the bookmarks bar. Never show a terminal, an `.env` file, the developer tools or a dashboard that holds keys.
6. The review queue stops the director at twelve waiting payments. Reset before each full run.
7. The demo buyer is prefilled as Aminata Koné, `aminata.kone@example.com`. Leave it.

## What must never appear

- The name of a bank, a mobile operator, a wallet or a payment company, on screen or in the voice. The app only says Mobile money, Bank transfer, USSD and Cash voucher.
- Any claim of a partnership, with PayPal or anyone else. Say "the PayPal sandbox".
- Any real money, real customer or real company data.
- Any cut that hides a **Simulated** or **Sandbox** tag when a local method is on screen.

## The shots

| Time         | Screen                                                                                                                                                                                                                                                                                    | Voice                                                                                                                                                                   | Caption                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 0:00 to 0:08 | The ProneBridge logo on white, then the Buyer storefront filling the frame. Slow push in on the course grid.                                                                                                                                                                              | Selling across Africa means one setup for every country.                                                                                                                | One checkout. Every market.                |
| 0:08 to 0:30 | Press **Buy** on AI for Work. The checkout opens in Côte d'Ivoire. Hold on the price in XOF. Change the country to Ghana: price, currency and methods change. Zoom on **Best match**, its numbers and the **Simulated** tag.                                                              | One checkout. The buyer's country sets the price, the currency and the methods. Method Match puts the best one first, with its numbers.                                 | Method Match. Demo data.                   |
| 0:30 to 0:55 | Choose **Card**. Type the sandbox card `4012 8888 8888 1881`, any future date, any three digits. Press **Pay**. The screen says **You're in**. Cut to the Seller tab: the **New sale** toast, then the Payments grid with the new row on top.                                             | Card and PayPal run in the PayPal sandbox. PayPal draws the card fields, so card numbers never touch our server. The seller sees the sale the second it happens.        | PayPal sandbox. No real money.             |
| 0:55 to 1:20 | Open **Demo**, run **A suspicious buyer**, read the result card for two seconds, close. Open Admin, then **Risk review**. Hold on the card: the score, **Throwaway email**, the note marked as written by AI. Press **Approve**. Cut to the Buyer tab: it moves on by itself.             | Every payment is scored before money moves. This one is held for a person. The rules decide. The AI only writes the note, and it never knows who or where the buyer is. | Rules decide. AI explains.                 |
| 1:20 to 1:38 | Run **Card testing attack**. Open Admin, then **Overview**: blocked payments climb. Cut to the Buyer tab: **Payment not completed** in plain words.                                                                                                                                       | A bot keeps trying. The first attempts are held, then it is blocked at once. The buyer sees plain words. No score. No reason.                                           | Blocked at once.                           |
| 1:38 to 1:55 | Admin, then **Fairness**. Press **Score it from every country**. The same score appears for every country. Hold on the list of what the rules never read.                                                                                                                                 | Country is never an input. The engine refuses it, and a test fails the build if one slips through.                                                                      | Country never decides risk.                |
| 1:55 to 2:25 | Seller, then **Copilot**. Press the chip **Which payment method works best in Ghana?** and let the answer arrive. Then press **Make a payment link for AI for Work that ends in 14 days**. The proposal card appears. Press **Confirm**. Cut to **Payment links**: the new link is there. | The copilot reads the seller's own data through tools, so every number is real. It can prepare a change, and nothing happens until the seller confirms.                 | Every change is confirmed.                 |
| 2:25 to 2:40 | Run **Mobile money outage**. The Seller tab toasts. Open the Buyer checkout: Mobile money is gone from the list. Run **The outage ends** and show it return.                                                                                                                              | A payment corridor goes down. Sellers are told, buyers stop seeing it, and Method Match reorders what is left.                                                          | Simulated outage.                          |
| 2:40 to 2:50 | The architecture diagram for four seconds. Then the logo, the tagline, and a line for the hackathon. Switch the app to dark for the last two seconds behind the logo.                                                                                                                     | ProneBridge. One checkout for every African market.                                                                                                                     | PayPal AI Hackathon. A Prone Data project. |

If the cut runs over, drop the outage shot first, then the fairness shot.

## Voice

One calm voice, in English, with no accent coaching and no hurry. Short sentences, pauses between them. Record the voice over the finished picture, not the other way round. About 110 words a minute. Do not read the captions aloud.

The total voice is about 190 words, so every shot has room to breathe. If a shot feels rushed, trim the sentence and keep the picture.

## Sound

A quiet instrumental bed with no vocals, royalty free, lowered under the voice. A very soft tick on each toast and each button press is fine. Nothing else.

## Captions

Burned in, white on a soft dark bar, bottom left, one short line per shot, as in the table. Keep **Simulated** and **Sandbox** visible whenever the app shows them. Do not add captions to the voice itself. Add subtitles as a separate track for YouTube.

## B-roll and still images

- Logo on white and on dark: `brand/output/logo/pronebridge-horizontal-2400.png` and `pronebridge-horizontal-dark-2400.png`.
- Architecture: `docs/architecture.png`.
- Social card, for the thumbnail: `client/public/og-image.png`.
- Extra cutaways if you need them: the theme switch, a filter and a CSV export in the Payments grid, the notification bell, the Corridors page.

## Delivery

MP4, H.264, 1920 by 1080, 30 frames a second, loudness about minus 16 LUFS. Upload to YouTube as public. Title: ProneBridge, One checkout for every African market, PayPal AI Hackathon. Description: the elevator pitch from `docs/DEVPOST.md`, then the repository link.
