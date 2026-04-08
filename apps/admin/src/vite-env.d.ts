/// <reference types="vite/client" />

// Web Speech API types (Chrome)
type SpeechRecognitionEvent = {
  results: { [index: number]: { [index: number]: { transcript: string } } }
}

type SpeechRecognitionInstance = {
  lang: string
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

interface Window {
  SpeechRecognition: SpeechRecognitionConstructor
  webkitSpeechRecognition: SpeechRecognitionConstructor
}
