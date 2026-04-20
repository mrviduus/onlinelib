const ADJECTIVES = [
  'Curious', 'Happy', 'Silent', 'Calm', 'Bright', 'Clever',
  'Gentle', 'Quick', 'Thoughtful', 'Quiet', 'Wandering', 'Focused',
] as const

const ANIMALS = [
  'Panda', 'Otter', 'Fox', 'Rabbit', 'Koala', 'Turtle',
  'Dolphin', 'Hedgehog', 'Penguin', 'Frog', 'Elephant', 'Squirrel',
] as const

const COLORS = [
  '#ef5350', '#ec407a', '#ab47bc', '#7e57c2',
  '#5c6bc0', '#42a5f5', '#26c6da', '#26a69a',
  '#66bb6a', '#9ccc65', '#ffa726', '#8d6e63',
] as const

const FALLBACK_NAME = 'Quiet Owl'
const FALLBACK_COLOR = COLORS[3]

function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pickAnimal(seed: string): typeof ANIMALS[number] {
  const h = hash(seed)
  return ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length]
}

export function getAnonymousReaderAnimal(seed?: string | null): string | null {
  if (!seed || typeof seed !== 'string') return null
  return pickAnimal(seed).toLowerCase()
}

export function getAnonymousReaderName(seed?: string | null): string {
  if (!seed || typeof seed !== 'string') return FALLBACK_NAME
  const h = hash(seed)
  const adj = ADJECTIVES[h % ADJECTIVES.length]
  const animal = ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length]
  return `${adj} ${animal}`
}

export function getAnonymousReaderColor(seed?: string | null): string {
  if (!seed || typeof seed !== 'string') return FALLBACK_COLOR
  return COLORS[hash(seed) % COLORS.length]
}

export function getAnonymousReaderAvatarPath(seed?: string | null): string | null {
  const animal = getAnonymousReaderAnimal(seed)
  return animal ? `/avatars/anon/${animal}.png` : null
}
