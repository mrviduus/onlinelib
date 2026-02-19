import type { SearchResult, SearchEdition } from '../types/api'

export interface GroupedEdition {
  edition: SearchEdition
  bestMatch: SearchResult
  otherMatches: SearchResult[]
  totalMatches: number
}

export function groupByEdition(results: SearchResult[]): GroupedEdition[] {
  const map = new Map<string, GroupedEdition>()

  for (const result of results) {
    const id = result.edition.id
    const existing = map.get(id)
    if (existing) {
      existing.otherMatches.push(result)
      existing.totalMatches++
    } else {
      map.set(id, {
        edition: result.edition,
        bestMatch: result,
        otherMatches: [],
        totalMatches: 1,
      })
    }
  }

  return Array.from(map.values())
}

// --- Recent searches (localStorage) ---

const STORAGE_KEY = 'textstack_recent_searches'
const MAX = 8

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addRecentSearch(query: string): void {
  try {
    const trimmed = query.trim()
    if (!trimmed) return
    const searches = getRecentSearches().filter(s => s !== trimmed)
    searches.unshift(trimmed)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches.slice(0, MAX)))
  } catch {
    // private browsing
  }
}

export function removeRecentSearch(query: string): void {
  try {
    const searches = getRecentSearches().filter(s => s !== query)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches))
  } catch {
    // private browsing
  }
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // private browsing
  }
}
