import { API_BASE, authFetch } from './client'

export type HotspotTopNote = {
  highlightId: string
  noteText: string | null
  likeCount: number
  color: string
  userId: string
  likedByMe: boolean
}

export type Hotspot = {
  key: string
  anchorJson: string
  text: string
  count: number
  likeTotal: number
  topNotes: HotspotTopNote[]
}

export async function getHotspots(editionId: string, chapterId: string): Promise<Hotspot[]> {
  const res = await fetch(
    `${API_BASE}/books/${editionId}/chapters/${chapterId}/hotspots`,
    { credentials: 'include' },
  )
  if (!res.ok) return []
  return res.json()
}

export function publishHighlight(id: string, isPublic: boolean) {
  return authFetch<unknown>(`/me/highlights/${id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPublic }),
  })
}

export function likeHighlight(id: string) {
  return authFetch<{ likeCount: number; liked: boolean }>(`/me/highlights/${id}/like`, {
    method: 'POST',
  })
}

export function unlikeHighlight(id: string) {
  return authFetch<{ likeCount: number; liked: boolean }>(`/me/highlights/${id}/like`, {
    method: 'DELETE',
  })
}

export function reportHighlight(id: string, reason: string, note?: string) {
  return authFetch<unknown>(`/me/highlights/${id}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, note }),
  })
}
