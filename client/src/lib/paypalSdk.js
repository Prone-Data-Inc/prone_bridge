/* PayPal's JavaScript SDK v6, loaded from PayPal when a buyer first picks card or PayPal, never before. The page makes an
   SDK "instance" with a short lived client token from our server (never the secret). One instance per component:
   "paypal-payments" for the PayPal button, "card-fields" for the card inputs. PayPal hosts the card inputs itself, so
   card numbers never touch this app or its server. Sandbox only. */
import { getClientToken } from '@/api/paypal.js'

export const SDK_URL = 'https://www.sandbox.paypal.com/web-sdk/v6/core'

/* A client token lives 15 minutes. An instance older than this is made again. */
const INSTANCE_LIFE_MS = 10 * 60_000

let loading = null

export function loadPaypal() {
  if (window.paypal?.createInstance) return Promise.resolve(window.paypal)
  loading ??= new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = SDK_URL
    tag.async = true
    tag.onload = () => {
      if (window.paypal?.createInstance) resolve(window.paypal)
      else fail(tag, reject, 'PayPal did not start.')
    }
    tag.onerror = () => fail(tag, reject, 'We could not load PayPal.')
    document.head.append(tag)
  })
  return loading
}

function fail(tag, reject, message) {
  loading = null
  tag.remove()
  reject(new Error(message))
}

const instances = new Map()

/* The SDK instance for a component, ready to use. Made once, and again when its token is getting old. */
export function paypalInstance(component) {
  const known = instances.get(component)
  if (known && Date.now() - known.madeAt < INSTANCE_LIFE_MS) return known.promise

  const promise = (async () => {
    const [paypal, { clientToken }] = await Promise.all([loadPaypal(), getClientToken()])
    return paypal.createInstance({ clientToken, components: [component] })
  })()
  instances.set(component, { promise, madeAt: Date.now() })
  promise.catch(() => instances.delete(component))
  return promise
}

/* For tests: forget everything loaded so far. */
export function resetPaypalSdk() {
  instances.clear()
  loading = null
}
