export function normalizeForSearch(s: string | null | undefined): string {
  if (!s) return ''
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export interface SearchableBook {
  title?: string | null
  author?: string | null
}

export function matchesQuery(book: SearchableBook, query: string): boolean {
  const nq = normalizeForSearch(query).trim()
  if (!nq) return true
  const haystack = `${normalizeForSearch(book.title)} ${normalizeForSearch(book.author)}`
  return nq.split(/\s+/).every(term => haystack.includes(term))
}
