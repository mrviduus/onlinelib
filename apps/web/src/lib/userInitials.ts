import { getAnonymousReaderName } from '@textstack/shared'

type InitialsUser = {
  id: string
  isGuest?: boolean
  name?: string | null
  email: string
}

export function getUserInitials(user: InitialsUser): string {
  if (user.isGuest) {
    return getAnonymousReaderName(user.id)
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
  }
  if (user.name) {
    return user.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return user.email[0].toUpperCase()
}
