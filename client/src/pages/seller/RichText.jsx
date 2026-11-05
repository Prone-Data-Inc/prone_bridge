/* An answer from the copilot, drawn as paragraphs, bullet lists and bold words. Built from elements only. Any other
   props (a class, a data attribute) go to the wrapper. */
import { parseRich } from '@/lib/richText.js'

function Parts({ parts }) {
  return parts.map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : part.text))
}

export default function RichText({ text, ...rest }) {
  return (
    <div {...rest}>
      {parseRich(text).map((block, index) =>
        block.type === 'ul' ? (
          <ul key={index}>
            {block.items.map((parts, item) => (
              <li key={item}>
                <Parts parts={parts} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <Parts parts={block.parts} />
          </p>
        ),
      )}
    </div>
  )
}
