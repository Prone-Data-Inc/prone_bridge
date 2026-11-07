/* s04 to s07: the app itself. Each scene pins moments of the recording to the words of the narration (anchors) and moves
   the camera to what is being talked about. Times in a scene are seconds from its start, with the voice beginning at 0.45.
   The word each anchor follows is written beside it. */
import { footageScene, marks as M } from '../footage.js'

const FULL = { cx: 784, cy: 426, s: 1 }

/* The buyer: storefront, checkout, Method Match, the PayPal sandbox, a local method, the unlock. */
export const buyer = footageScene({
  id: 's04_buyer',
  label: ['Buyer', 'Prone Data Learning, and the ProneBridge checkout'],
  anchors: [
    [0.0, M.shop] /* the buyer */,
    [1.7, M.buyClicked] /* picks a country: the course is chosen */,
    [2.3, M.checkout],
    [3.7, M.country] /* currency: the country changes, the price follows */,
    [5.3, M.methods],
    [8.0, M.paypalSelected - 1.0] /* Method Match, the one most likely to work first */,
    [9.5, M.paypalSelected] /* PayPal */,
    [10.6, M.paypalShown] /* and cards: PayPal's own button */,
    [11.4, M.paypalShown + 1.25],
    [12.5, M.cardSelected] /* the PayPal sandbox: the card */,
    [13.6, M.cardShown],
    [14.4, M.cardShown + 1.25] /* Local methods are simulated */,
    [15.2, M.localSelected] /* like this one: mobile money */,
    [16.2, M.payClicked],
    [17.3, M.paid] /* unlocks */,
    [18.27, M.paid + 1.0],
  ],
  camera: [
    [0.0, FULL],
    [1.0, { cx: 780, cy: 470, s: 1.12 }],
    [1.7, { cx: 780, cy: 590, s: 1.28 }],
    [2.4, { cx: 784, cy: 410, s: 1.12 }],
    [3.2, { cx: 800, cy: 400, s: 1.3 }],
    [5.3, { cx: 860, cy: 640, s: 1.25 }],
    [9.5, { cx: 860, cy: 640, s: 1.25 }],
    [10.6, { cx: 860, cy: 560, s: 1.2 }],
    [12.5, { cx: 860, cy: 560, s: 1.2 }],
    [13.6, { cx: 860, cy: 610, s: 1.25 }],
    [15.2, { cx: 860, cy: 560, s: 1.2 }],
    [16.2, { cx: 860, cy: 600, s: 1.2 }],
    [17.4, { cx: 860, cy: 470, s: 1.08 }],
    [18.27, FULL],
  ],
})

/* The seller: the new sale, the payments, the payout. */
export const seller = footageScene({
  id: 's05_seller',
  label: ['Seller', 'The dashboard of Prone Data Learning'],
  anchors: [
    [0.0, M.sellerTab + 0.9] /* The seller */,
    [3.4, M.sellerTab + 3.4] /* Volume, customers */,
    [4.0, M.payments],
    [6.0, M.payments + 2.8] /* payment links, payouts */,
    [6.6, M.payouts],
    [7.7, M.payoutClicked + 0.3] /* One tap */,
    [10.33, M.payoutClicked + 2.9] /* the payout is on its way */,
  ],
  camera: [
    [0.0, FULL],
    [3.4, FULL],
    [4.1, { cx: 900, cy: 480, s: 1.2 }],
    [6.0, { cx: 900, cy: 480, s: 1.2 }],
    [6.7, { cx: 900, cy: 340, s: 1.2 }],
    [8.3, { cx: 900, cy: 340, s: 1.2 }],
    [8.9, { cx: 1000, cy: 520, s: 1.25 }],
    [10.33, { cx: 1000, cy: 520, s: 1.25 }],
  ],
})

/* The admin: the network, the risk rating, the review, the fairness proof. A pair of anchors at one time is a cut. */
export const admin = footageScene({
  id: 's06_admin',
  label: ['Admin', 'The whole network'],
  labels: [
    [3.0, ['Admin', 'Every payment is scored before money moves']],
    [7.4, ['Admin', 'Risk review: a person decides']],
    [9.4, ['Admin', 'Blocked at once']],
    [11.1, ['Admin', 'Country is never a signal']],
  ],
  anchors: [
    [0.0, M.adminTab + 0.2] /* The admin sees the whole network */,
    [2.9, M.adminTab + 2.8],
    [2.9, M.transactions + 0.1] /* Every payment is scored */,
    [7.2, M.transactions + 2.9] /* Low goes through */,
    [7.25, M.review - 0.1] /* Medium waits for a person */,
    [9.3, M.reviewHover + 0.6],
    [9.35, M.transactions + 1.0] /* High is blocked at once */,
    [11.0, M.transactions + 2.8],
    [11.05, M.fairness] /* And country is never a signal */,
    [12.2, M.fairnessRun - 0.2],
    [13.0, M.fairnessDone + 0.1] /* the engine refuses it */,
    [15.98, M.fairnessDone + 3.0],
  ],
  camera: [
    [0.0, FULL],
    [1.8, { cx: 900, cy: 380, s: 1.3 }],
    [2.89, { cx: 900, cy: 380, s: 1.3 }],
    [2.91, { cx: 900, cy: 560, s: 1.3 }],
    [7.2, { cx: 900, cy: 560, s: 1.3 }],
    [7.26, { cx: 900, cy: 470, s: 1.3 }],
    [9.3, { cx: 900, cy: 470, s: 1.3 }],
    [9.36, { cx: 1010, cy: 640, s: 2.0 }],
    [11.0, { cx: 1010, cy: 640, s: 2.0 }],
    [11.06, { cx: 900, cy: 600, s: 1.3 }],
    [13.0, { cx: 900, cy: 650, s: 1.3 }],
    [15.98, { cx: 900, cy: 650, s: 1.3 }],
  ],
})

/* The copilot: a question, an answer, a proposed change, a confirmation. */
export const copilot = footageScene({
  id: 's07_copilot',
  label: ['Seller', 'AI copilot'],
  anchors: [
    [0.0, M.copilot - 0.3] /* Then, AI changes the game */,
    [1.8, M.copilot + 1.7],
    [3.3, M.asked + 0.1] /* A copilot that reads the seller's own data */,
    [4.7, M.answered - 2.3],
    [7.0, M.answered] /* answers in plain words */,
    [8.6, M.asked2 + 0.1] /* and prepares changes */,
    [9.8, M.proposal - 0.2] /* like a payment link */,
    [11.2, M.proposal + 2.4] /* Nothing happens until */,
    [12.2, M.confirmClicked] /* the seller confirms */,
    [13.84, M.confirmClicked + 2.6],
  ],
  camera: [
    [0.0, FULL],
    [1.4, { cx: 880, cy: 480, s: 1.25 }],
    [3.4, { cx: 880, cy: 420, s: 1.35 }],
    [4.7, { cx: 880, cy: 380, s: 1.6 }],
    [7.0, { cx: 880, cy: 400, s: 1.5 }],
    [8.6, { cx: 880, cy: 520, s: 1.3 }],
    [9.8, { cx: 880, cy: 620, s: 1.55 }],
    [11.2, { cx: 880, cy: 560, s: 1.4 }],
    [12.2, { cx: 940, cy: 600, s: 1.35 }],
    [13.0, { cx: 1000, cy: 680, s: 1.35 }],
    [13.84, { cx: 1000, cy: 680, s: 1.35 }],
  ],
})
