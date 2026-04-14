import { API_BASE } from './client'

export function getTtsAudioUrl(text: string, lang: string, voice?: string, speed?: number): string {
  const params = new URLSearchParams({ text, lang })
  if (voice) params.set('voice', voice)
  if (speed && speed !== 1.0) params.set('speed', String(speed))
  return `${API_BASE}/tts?${params}`
}

export async function fetchTtsAudio(
  text: string,
  lang: string,
  voice?: string,
  speed?: number
): Promise<ArrayBuffer> {
  const url = getTtsAudioUrl(text, lang, voice, speed)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TTS error: ${res.status}`)
  return res.arrayBuffer()
}

export interface TtsVoiceInfo {
  name: string
  shortName: string
  gender: string
  locale: string
  language: string
}

export async function fetchTtsVoices(lang?: string): Promise<TtsVoiceInfo[]> {
  const params = lang ? `?lang=${lang}` : ''
  const res = await fetch(`${API_BASE}/tts/voices${params}`)
  if (!res.ok) throw new Error(`Failed to fetch voices: ${res.status}`)
  return res.json()
}
