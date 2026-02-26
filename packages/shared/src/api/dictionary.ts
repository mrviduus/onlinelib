import { publicFetch } from './client'

export interface DictionaryEntry {
  word: string
  phonetic?: string
  meanings: {
    partOfSpeech: string
    definitions: { definition: string; example?: string }[]
  }[]
}

export function lookupWord(lang: string, word: string) {
  return publicFetch<DictionaryEntry>(`/dictionary/${lang}/${encodeURIComponent(word)}`)
}
