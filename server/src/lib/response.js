/* Every success answers { data }, every failure answers { error: { code, message, requestId } }. */
export const ok = (c, data, status = 200) => c.json({ data }, status)

export const errorBody = (c, code, message, details) => ({
  error: { code, message, requestId: c.get('requestId'), ...(details ? { details } : {}) },
})
