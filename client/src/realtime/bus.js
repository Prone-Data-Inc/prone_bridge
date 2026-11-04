/* The live signals, shared. The connection emits each signal here; any store or page that cares subscribes.
   A signal is { table, op, id, merchantId, buyerId, status, audience, kind }: ids only, details come from the API. */
const listeners = new Set()

export function onSignal(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitSignal(signal) {
  for (const listener of [...listeners]) listener(signal)
}
