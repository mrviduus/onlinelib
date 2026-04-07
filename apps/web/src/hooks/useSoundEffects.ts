import { useCallback, useRef } from 'react'

const STORAGE_KEY = 'review.soundEnabled'

function getSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v !== 'false' // default enabled
  } catch { return true }
}

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15) {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(gain, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
}

function playCorrect() {
  playTone(880, 0.12, 'sine', 0.12)
  setTimeout(() => playTone(1175, 0.15, 'sine', 0.1), 80)
}

function playWrong() {
  playTone(280, 0.2, 'triangle', 0.1)
}

function playComplete() {
  playTone(660, 0.1, 'sine', 0.1)
  setTimeout(() => playTone(880, 0.1, 'sine', 0.1), 100)
  setTimeout(() => playTone(1100, 0.15, 'sine', 0.12), 200)
}

function playFlip() {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(400, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08)
  g.gain.setValueAtTime(0.06, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.1)
}

export function useSoundEffects() {
  const enabled = useRef(getSoundEnabled())

  const play = useCallback((sound: 'correct' | 'wrong' | 'complete' | 'flip') => {
    if (!enabled.current) return
    switch (sound) {
      case 'correct': playCorrect(); break
      case 'wrong': playWrong(); break
      case 'complete': playComplete(); break
      case 'flip': playFlip(); break
    }
  }, [])

  const toggle = useCallback(() => {
    enabled.current = !enabled.current
    try { localStorage.setItem(STORAGE_KEY, String(enabled.current)) } catch {}
    return enabled.current
  }, [])

  return { play, toggle, isEnabled: () => enabled.current }
}
