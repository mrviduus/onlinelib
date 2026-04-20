const ADJECTIVES = [
  'Curious', 'Happy', 'Silent', 'Calm', 'Bright', 'Clever',
  'Gentle', 'Quick', 'Thoughtful', 'Quiet', 'Wandering', 'Focused',
] as const

const ANIMALS = [
  'Panda', 'Otter', 'Fox', 'Owl', 'Rabbit', 'Koala',
  'Deer', 'Turtle', 'Cat', 'Dolphin', 'Sparrow', 'Hedgehog',
] as const

const FALLBACK = 'Quiet Owl'

function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function getAnonymousReaderName(seed?: string | null): string {
  if (!seed || typeof seed !== 'string') return FALLBACK
  const h = hash(seed)
  const adj = ADJECTIVES[h % ADJECTIVES.length]
  const animal = ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length]
  return `${adj} ${animal}`
}
