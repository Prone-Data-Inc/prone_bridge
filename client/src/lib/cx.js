/* Joins class names, skipping anything falsy: cx(s.card, active && s.active). */
export const cx = (...names) => names.filter(Boolean).join(' ')
