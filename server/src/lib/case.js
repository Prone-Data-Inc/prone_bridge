/* Database columns are snake_case, the API speaks camelCase. */
const camel = (key) => key.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase())

/* The top-level keys of a row (or each row of a list) in camelCase. Values are left as they are. */
export function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [camel(key), inner]))
  }
  return value
}
