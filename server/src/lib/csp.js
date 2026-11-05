/* The Content Security Policy of the web app: what the browser may load and talk to. It is written once, here. The Node
   and Docker server sends it, and vercel.json must carry the same text (a test checks that), since on Vercel the files come
   from the CDN and not from this server.

   What the app really loads: its own files, PayPal's SDK, button and card field frames (paypal.com, paypalobjects.com;
   sandbox is a subdomain of the first), and Supabase Realtime (https and wss to supabase.co). Nothing else: no other
   script, no other frame, nobody may frame this app, and there are no plugins. Styles may be inline, since React sets
   style attributes. Scripts may not be. PayPal's own page lists the same origins for its SDK. */

const PAYPAL = ['https://*.paypal.com', 'https://*.paypalobjects.com']
const SUPABASE = ['https://*.supabase.co', 'wss://*.supabase.co']

const POLICY = {
  'default-src': ["'self'"],
  'script-src': ["'self'", ...PAYPAL],
  'style-src': ["'self'", "'unsafe-inline'", ...PAYPAL],
  'img-src': ["'self'", 'data:', ...PAYPAL],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", ...SUPABASE, ...PAYPAL],
  'frame-src': PAYPAL,
  'child-src': PAYPAL,
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
}

export const CSP = Object.entries(POLICY)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ')

/* PayPal opens a popup for some payments, and a page that cuts itself off from the windows it opened would break it. */
export const OPENER_POLICY = 'same-origin-allow-popups'
