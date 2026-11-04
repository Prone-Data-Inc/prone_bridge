/* Vercel entry. Vercel runs every file in /api as a function and vercel.json sends all /api/* paths here, so the whole
   backend is this one function. It takes a web-standard Request and returns a Response, which keeps the raw request
   body intact for PayPal webhook signature checks. Keep other files out of /api: each one would become its own function. */
import { createApp } from '../server/src/app.js'

let app

export default {
  fetch(request) {
    app ??= createApp()
    return app.fetch(request)
  },
}
