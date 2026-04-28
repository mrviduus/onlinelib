import { authFetch } from './client'

export interface LibraryShelfItem {
  id: string
  type: 'userbook' | 'savedbook'
  title: string
  author: string | null
  coverPath: string | null
  slug: string | null
  language: string | null
  progressPercent: number
  lastOpenedAt: string | null
  createdAt: string
  estimatedMinutesRemaining: number | null
}

export interface LibraryShelves {
  continueReading: LibraryShelfItem[]
  recentlyAdded: LibraryShelfItem[]
  quickReads: LibraryShelfItem[]
  finishedThisMonth: LibraryShelfItem[]
}

export async function getLibraryShelves(): Promise<LibraryShelves> {
  return authFetch<LibraryShelves>('/me/library/shelves')
}
