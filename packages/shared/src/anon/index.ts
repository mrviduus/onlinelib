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

const FALLBACK: AnonymousReader = {
  name: 'Quiet Owl',
  color: COLORS[3],
  animal: null,
  avatarPath: null,
}

export type AnonymousReader = {
  name: string
  color: string
  animal: string | null
  avatarPath: string | null
}

function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function getAnonymousReader(seed?: string | null): AnonymousReader {
  if (!seed || typeof seed !== 'string') return FALLBACK
  const h = hash(seed)
  const adj = ADJECTIVES[h % ADJECTIVES.length]
  const animal = ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length]
  const lower = animal.toLowerCase()
  return {
    name: `${adj} ${animal}`,
    color: COLORS[h % COLORS.length],
    animal: lower,
    avatarPath: `/avatars/anon/${lower}.png`,
  }
}

export const getAnonymousReaderName = (seed?: string | null) => getAnonymousReader(seed).name
export const getAnonymousReaderColor = (seed?: string | null) => getAnonymousReader(seed).color
export const getAnonymousReaderAnimal = (seed?: string | null) => getAnonymousReader(seed).animal
export const getAnonymousReaderAvatarPath = (seed?: string | null) => getAnonymousReader(seed).avatarPath
