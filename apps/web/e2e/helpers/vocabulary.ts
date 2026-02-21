import type { APIRequestContext } from '@playwright/test'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const HEADERS = { Host: 'general.localhost', 'Content-Type': 'application/json' }

export interface TestWord {
  word: string
  language: string
  translation: string
  definition: string
  sentence?: string
  bookTitle?: string
}

export const TEST_WORDS: TestWord[] = [
  { word: 'castle', language: 'en', translation: 'замок', definition: 'A large fortified building or group of buildings', sentence: 'The old castle stood on the hill.', bookTitle: 'Dracula' },
  { word: 'shadow', language: 'en', translation: 'тінь', definition: 'A dark area produced by a body blocking light', sentence: 'A shadow crept across the wall.', bookTitle: 'Dracula' },
  { word: 'mirror', language: 'en', translation: 'дзеркало', definition: 'A reflective surface used to see oneself' },
  { word: 'journey', language: 'en', translation: 'подорож', definition: 'An act of traveling from one place to another' },
  { word: 'wisdom', language: 'en', translation: 'мудрість', definition: 'The quality of having experience and good judgment' },
]

export async function saveTestWords(request: APIRequestContext): Promise<string[]> {
  const ids: string[] = []
  for (const w of TEST_WORDS) {
    const resp = await request.post(`${API_URL}/me/vocabulary/words`, {
      headers: HEADERS,
      data: w,
    })
    if (resp.ok()) {
      const body = await resp.json()
      ids.push(body.id)
    }
  }
  return ids
}

export async function deleteAllTestWords(request: APIRequestContext) {
  const resp = await request.get(`${API_URL}/me/vocabulary/words?limit=100`, {
    headers: { Host: 'general.localhost' },
  })
  if (!resp.ok()) return
  const { items } = await resp.json()
  for (const w of items) {
    await request.delete(`${API_URL}/me/vocabulary/words/${w.id}`, {
      headers: { Host: 'general.localhost' },
    })
  }
}
