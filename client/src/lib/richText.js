/* The copilot answers in plain text with, at most, **bold** and lines that start with "- ". This turns that into blocks
   the page can draw as elements. Nothing here is ever put on the page as HTML, so no answer can inject markup. */

/* "Sales are **up 12%** on last week" -> [{ text: 'Sales are ' }, { text: 'up 12%', bold: true }, { text: ' on last week' }] */
export function inline(text) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => (/^\*\*[^*]+\*\*$/.test(part) ? { text: part.slice(2, -2), bold: true } : { text: part }))
}

const BULLET = /^[-*]\s+(.*)$/

/* Blocks, in order: { type: 'p', parts } or { type: 'ul', items: [parts, ...] }. A blank line ends a block, and lines
   that follow each other with no blank line between them stay one paragraph. */
export function parseRich(text) {
  const blocks = []
  let paragraph = null
  let list = null

  for (const raw of String(text).split('\n')) {
    const line = raw.trim()
    if (line === '') {
      paragraph = null
      list = null
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet) {
      paragraph = null
      if (!list) {
        list = { type: 'ul', items: [] }
        blocks.push(list)
      }
      list.items.push(inline(bullet[1]))
      continue
    }
    list = null
    if (paragraph) {
      paragraph.parts.push({ text: ' ' }, ...inline(line))
    } else {
      paragraph = { type: 'p', parts: inline(line) }
      blocks.push(paragraph)
    }
  }
  return blocks
}
