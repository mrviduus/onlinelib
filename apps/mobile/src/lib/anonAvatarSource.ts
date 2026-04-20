import type { ImageSourcePropType } from 'react-native'
import { getAnonymousReaderAnimal } from '@textstack/shared'

const SOURCES: Record<string, ImageSourcePropType> = {
  panda: require('../../assets/avatars/anon/panda.png'),
  otter: require('../../assets/avatars/anon/otter.png'),
  fox: require('../../assets/avatars/anon/fox.png'),
  rabbit: require('../../assets/avatars/anon/rabbit.png'),
  koala: require('../../assets/avatars/anon/koala.png'),
  turtle: require('../../assets/avatars/anon/turtle.png'),
  dolphin: require('../../assets/avatars/anon/dolphin.png'),
  hedgehog: require('../../assets/avatars/anon/hedgehog.png'),
  penguin: require('../../assets/avatars/anon/penguin.png'),
  frog: require('../../assets/avatars/anon/frog.png'),
  elephant: require('../../assets/avatars/anon/elephant.png'),
  squirrel: require('../../assets/avatars/anon/squirrel.png'),
}

export function getAnonAvatarSource(seed?: string | null): ImageSourcePropType | null {
  const animal = getAnonymousReaderAnimal(seed)
  return animal ? SOURCES[animal] ?? null : null
}
