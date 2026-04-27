import { authFetch, API_BASE } from './client'
import { trackBookUploaded } from '../lib/analytics'

export interface UserBook {
  id: string
  title: string
  slug: string
  language: string
  author: string | null
  description: string | null
  coverPath: string | null
  genre: string | null
  status: 'Processing' | 'Ready' | 'Failed'
  errorMessage: string | null
  chapterCount: number
  totalWordCount: number | null
  createdAt: string
  completedAt: string | null
  progressPercent: number | null
  progressUpdatedAt: string | null
  progressChapterSlug: string | null
}

export interface UserChapterSummary {
  id: string
  chapterNumber: number
  slug: string | null
  title: string
  wordCount: number | null
}

export interface TocEntry {
  title: string
  chapterNumber: number | null
  children: TocEntry[] | null
}

export interface UserBookDetail {
  id: string
  title: string
  slug: string
  language: string
  author: string | null
  description: string | null
  coverPath: string | null
  genre: string | null
  publishedYear: number | null
  totalWordCount: number | null
  status: 'Processing' | 'Ready' | 'Failed'
  errorMessage: string | null
  chapters: UserChapterSummary[]
  toc: TocEntry[] | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface UserChapter {
  id: string
  chapterNumber: number
  slug: string | null
  title: string
  html: string
  wordCount: number | null
  previous: { chapterNumber: number; slug: string | null; title: string } | null
  next: { chapterNumber: number; slug: string | null; title: string } | null
}

export interface UploadResponse {
  userBookId: string
  jobId: string
  status: string
}

export interface StorageQuota {
  usedBytes: number
  limitBytes: number
  usedPercent: number
}

export async function uploadUserBook(
  file: File,
  title?: string,
  language?: string,
  onProgress?: (percent: number) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    if (title) formData.append('title', title)
    if (language) formData.append('language', language)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress((e.loaded / e.total) * 100)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // GA4: conversion signal — users who upload their own book are far
        // more valuable than passive catalog readers. Derive format from
        // extension since MIME for .fb2/.epub is inconsistent across browsers.
        const ext = (file.name.split('.').pop() || '').toLowerCase()
        trackBookUploaded({ format: ext || 'unknown', sizeBytes: file.size })
        resolve(JSON.parse(xhr.responseText))
      } else {
        let error = `Upload failed: ${xhr.status}`
        try {
          const json = JSON.parse(xhr.responseText)
          if (json.error) error = json.error
        } catch {}
        reject(new Error(error))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Upload failed')))

    xhr.open('POST', `${API_BASE}/me/books/upload`)
    xhr.withCredentials = true
    xhr.send(formData)
  })
}

export async function getUserBooks(): Promise<UserBook[]> {
  return authFetch<UserBook[]>('/me/books')
}

export async function getUserBook(id: string): Promise<UserBookDetail> {
  return authFetch<UserBookDetail>(`/me/books/${id}`)
}

export async function getUserBookChapter(bookId: string, slug: string): Promise<UserChapter> {
  return authFetch<UserChapter>(`/me/books/${bookId}/chapters/${slug}`)
}

export async function deleteUserBook(id: string): Promise<void> {
  await authFetch<void>(`/me/books/${id}`, { method: 'DELETE' })
}

export async function retryUserBook(id: string): Promise<void> {
  await authFetch<void>(`/me/books/${id}/retry`, { method: 'POST' })
}

export async function cancelUserBook(id: string): Promise<void> {
  await authFetch<void>(`/me/books/${id}/cancel`, { method: 'POST' })
}

export async function markUserBookComplete(id: string): Promise<void> {
  await authFetch<void>(`/me/books/${id}/complete`, { method: 'POST' })
}

export async function unmarkUserBookComplete(id: string): Promise<void> {
  await authFetch<void>(`/me/books/${id}/complete`, { method: 'DELETE' })
}

export async function getStorageQuota(): Promise<StorageQuota> {
  return authFetch<StorageQuota>('/me/books/quota')
}

export interface UpdateUserBookMetadataRequest {
  title: string
  author?: string | null
  language: string
  genre?: string | null
  description?: string | null
  publishedYear?: number | null
}

export async function updateUserBookMetadata(
  id: string,
  data: UpdateUserBookMetadataRequest,
): Promise<UserBookDetail> {
  return authFetch<UserBookDetail>(`/me/books/${id}/metadata`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export function getUserBookCoverUrl(coverPath: string | null | undefined): string | undefined {
  if (!coverPath) return undefined
  return `${API_BASE}/storage/${coverPath}`
}

// Progress API
export interface UserBookProgress {
  chapterSlug: string | null
  locator: string | null
  percent: number | null
  updatedAt: string | null
}

export async function getUserBookProgress(bookId: string): Promise<UserBookProgress | null> {
  try {
    return await authFetch<UserBookProgress>(`/me/books/${bookId}/progress`)
  } catch {
    return null
  }
}

export async function saveUserBookProgress(
  bookId: string,
  data: { chapterSlug: string; locator?: string; percent?: number; updatedAt?: string }
): Promise<void> {
  await authFetch<void>(`/me/books/${bookId}/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// Bookmark API
export interface UserBookBookmark {
  id: string
  chapterId: string
  chapterSlug: string | null
  locator: string
  title: string | null
  createdAt: string
}

export async function getUserBookBookmarks(bookId: string): Promise<UserBookBookmark[]> {
  return authFetch<UserBookBookmark[]>(`/me/books/${bookId}/bookmarks`)
}

export async function createUserBookBookmark(
  bookId: string,
  data: { chapterId: string; locator: string; title?: string }
): Promise<UserBookBookmark> {
  return authFetch<UserBookBookmark>(`/me/books/${bookId}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

export async function deleteUserBookBookmark(bookId: string, bookmarkId: string): Promise<void> {
  await authFetch<void>(`/me/books/${bookId}/bookmarks/${bookmarkId}`, {
    method: 'DELETE',
  })
}
