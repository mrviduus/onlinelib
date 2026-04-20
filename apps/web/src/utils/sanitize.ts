import DOMPurify from 'dompurify'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IMG') {
    node.setAttribute('loading', 'lazy')
    node.setAttribute('decoding', 'async')
  }
})

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html)
}
