/* The address a payment link has when it is shared: this app, opened on the buyer's link page. */
export const linkUrl = (code) => `${window.location.origin}${window.location.pathname}#/buyer/link/${code}`

/* Puts text on the clipboard. Answers whether it worked, so the caller can say so. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    /* Older browsers and pages without clipboard access: fall back to selecting a hidden field. */
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.append(field)
    field.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      field.remove()
    }
  }
}
