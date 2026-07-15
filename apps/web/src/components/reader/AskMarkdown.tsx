import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AskCitation } from '../../api/ask'

/**
 * Renders an assistant turn as markdown (headings, lists, emphasis, inline/fenced code,
 * GFM tables, blockquotes). Safe-by-default: react-markdown does NOT parse raw HTML (no
 * rehype-raw), so model output can't inject markup — no dangerouslySetInnerHTML anywhere.
 *
 * Inline `[n]` citation markers are lifted out of text nodes by a tiny rehype pass and
 * rendered as clickable superscripts wired to the same jump handler as the citation chips
 * below the answer. Markers inside code/pre are left untouched.
 */
interface Props {
  text: string
  citations: AskCitation[]
  onNavigateToCitation: (citation: AskCitation) => void
  citationTitle: (citation: AskCitation) => string
}

/** Split a raw text value on `[n]` markers into interleaved text + <sup> hast nodes. */
function splitCitations(value: string): unknown[] {
  const out: unknown[] = []
  let last = 0
  const re = /\[(\d+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) })
    out.push({
      type: 'element',
      tagName: 'sup',
      properties: { className: ['ask-md__cite'], dataMarker: m[1] },
      children: [{ type: 'text', value: m[0] }],
    })
    last = m.index + m[0].length
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
  return out
}

/** rehype plugin: wrap `[n]` markers in <sup> elements, skipping code/pre subtrees. */
function rehypeCitations() {
  const walk = (node: any) => {
    if (node.type === 'element' && (node.tagName === 'code' || node.tagName === 'pre')) return
    const children = node.children
    if (!Array.isArray(children)) return
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child.type === 'text' && /\[\d+\]/.test(child.value)) {
        const replacement = splitCitations(child.value)
        children.splice(i, 1, ...replacement)
        i += replacement.length - 1
      } else {
        walk(child)
      }
    }
  }
  return (tree: any) => walk(tree)
}

function AskMarkdownImpl({ text, citations, onNavigateToCitation, citationTitle }: Props) {
  const components: Components = {
    // Tables scroll horizontally inside the narrow panel instead of overflowing it.
    table: ({ children }) => (
      <div className="ask-md__table-wrap">
        <table>{children}</table>
      </div>
    ),
    // Model-emitted links open safely in a new tab.
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    // Our injected citation markers become clickable; any other <sup> renders normally.
    sup: ({ node, children }) => {
      const props = (node?.properties ?? {}) as { className?: unknown; dataMarker?: unknown }
      const isCite = Array.isArray(props.className) && props.className.includes('ask-md__cite')
      if (!isCite) return <sup>{children}</sup>
      const marker = Number(props.dataMarker)
      const citation = citations.find(c => c.marker === marker)
      if (!citation) return <sup className="ask-md__cite ask-md__cite--dead">{children}</sup>
      return (
        <button
          type="button"
          className="ask-md__cite"
          title={citationTitle(citation)}
          onClick={() => onNavigateToCitation(citation)}
        >
          {children}
        </button>
      )
    },
  }

  return (
    <div className="ask-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeCitations]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

export const AskMarkdown = memo(AskMarkdownImpl)
