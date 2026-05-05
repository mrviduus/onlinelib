import { authFetch } from './client'

export interface Collection {
  id: string
  name: string
  color: string
  sortOrder: number
  count: number
}

export type BookType = 'userbook' | 'savedbook'

export async function listCollections(): Promise<Collection[]> {
  return authFetch<Collection[]>('/me/library/collections')
}

export async function createCollection(name: string, color?: string): Promise<Collection> {
  return authFetch<Collection>('/me/library/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  })
}

export async function updateCollection(
  id: string,
  data: { name?: string; color?: string; sortOrder?: number },
): Promise<Collection> {
  return authFetch<Collection>(`/me/library/collections/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteCollection(id: string): Promise<void> {
  await authFetch<void>(`/me/library/collections/${id}`, { method: 'DELETE' })
}

export async function getCollectionBookIds(id: string, bookType: BookType): Promise<string[]> {
  return authFetch<string[]>(`/me/library/collections/${id}/books?bookType=${bookType}`)
}

export async function addBookToCollection(
  collectionId: string,
  bookId: string,
  bookType: BookType,
): Promise<void> {
  await authFetch<void>(`/me/library/collections/${collectionId}/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId, bookType }),
  })
}

export async function removeBookFromCollection(
  collectionId: string,
  bookId: string,
  bookType: BookType,
): Promise<void> {
  await authFetch<void>(
    `/me/library/collections/${collectionId}/books/${bookId}?bookType=${bookType}`,
    { method: 'DELETE' },
  )
}
