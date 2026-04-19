import { authFetch } from './client'

export type RoomTargetType = 'Edition' | 'UserBook'

export interface RoomMemberView {
  userId: string
  userName: string | null
  userPicture: string | null
  color: string
  role: 'Owner' | 'Member'
  showProgress: boolean
  joinedAt: string
  lastSeenAt: string
  currentChapterId: string | null
  currentPercent: number | null
}

export interface RoomView {
  id: string
  targetType: RoomTargetType
  targetId: string
  ownerUserId: string
  name: string | null
  createdAt: string
  closedAt: string | null
  members: RoomMemberView[]
  bookTitle: string | null
  bookSlug: string | null
  bookLanguage: string | null
  bookCoverPath: string | null
  firstChapterSlug: string | null
}

export interface RoomSummary {
  id: string
  targetType: RoomTargetType
  targetId: string
  name: string | null
  memberCount: number
  lastActivityAt: string
  isOwner: boolean
  bookTitle: string | null
  bookSlug: string | null
  bookLanguage: string | null
  bookCoverPath: string | null
  firstChapterSlug: string | null
}

export interface SharedHighlightView {
  id: string
  userId: string
  memberColor: string
  chapterId: string | null
  anchorJson: string
  color: string
  selectedText: string
  noteText: string | null
  updatedAt: string
}

export interface RoomStateView {
  members: RoomMemberView[]
  highlights: SharedHighlightView[]
  highlightDeletes: string[]
  cursor: string
}

export interface CreateRoomResult {
  roomId: string
  inviteToken: string
  inviteExpiresAt: string
}

export interface CreateInviteResult {
  id: string
  token: string
  expiresAt: string
}

export function createRoom(
  targetType: RoomTargetType,
  targetId: string,
  name?: string
): Promise<CreateRoomResult> {
  return authFetch<CreateRoomResult>('/me/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType, targetId, name }),
  })
}

export function listMyRooms(limit = 20, activeOnly = true): Promise<RoomSummary[]> {
  return authFetch<RoomSummary[]>(`/me/rooms?limit=${limit}&active=${activeOnly}`)
}

export function closeRoom(roomId: string): Promise<void> {
  return authFetch<void>(`/me/rooms/${roomId}`, { method: 'DELETE' })
}

export function getRoom(roomId: string): Promise<RoomView> {
  return authFetch<RoomView>(`/rooms/${roomId}`)
}

export function leaveRoom(roomId: string): Promise<void> {
  return authFetch<void>(`/rooms/${roomId}/leave`, { method: 'POST' })
}

export function joinRoom(token: string): Promise<{ roomId: string }> {
  return authFetch<{ roomId: string }>('/rooms/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

export function createInvite(
  roomId: string,
  opts?: { expiresInSeconds?: number; maxUses?: number }
): Promise<CreateInviteResult> {
  return authFetch<CreateInviteResult>(`/rooms/${roomId}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts ?? {}),
  })
}

export function revokeInvite(roomId: string, inviteId: string): Promise<void> {
  return authFetch<void>(`/rooms/${roomId}/invites/${inviteId}/revoke`, { method: 'POST' })
}

export function getRoomState(roomId: string, since?: string): Promise<RoomStateView> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : ''
  return authFetch<RoomStateView>(`/rooms/${roomId}/state${qs}`)
}

export function heartbeat(
  roomId: string,
  body: { chapterId?: string | null; percent?: number | null; showProgress?: boolean }
): Promise<void> {
  return authFetch<void>(`/rooms/${roomId}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
