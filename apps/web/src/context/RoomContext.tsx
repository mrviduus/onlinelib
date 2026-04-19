import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  createRoom as apiCreateRoom,
  joinRoom as apiJoinRoom,
  getRoom as apiGetRoom,
  getRoomState,
  heartbeat as apiHeartbeat,
  leaveRoom as apiLeaveRoom,
  closeRoom as apiCloseRoom,
  createInvite as apiCreateInvite,
  revokeInvite as apiRevokeInvite,
  type RoomView,
  type RoomMemberView,
  type SharedHighlightView,
  type CreateInviteResult,
} from '../api/rooms'
import { ApiError } from '../api/client'
import { useAuth } from './AuthContext'

const POLL_MS = 5000
const HEARTBEAT_MS = 30000
const PRESENCE_MS = 60000 // member considered online if lastSeen < 60s

interface RoomContextValue {
  roomId: string | null
  room: RoomView | null
  members: RoomMemberView[]
  sharedHighlights: SharedHighlightView[]
  isOwner: boolean
  isConnected: boolean
  error: string | null

  setActiveRoom: (roomId: string | null) => void
  clearError: () => void
  createRoom: (targetType: 'Edition' | 'UserBook', targetId: string, name?: string) => Promise<string>
  joinRoom: (token: string) => Promise<string>
  leaveRoom: () => Promise<void>
  closeRoom: () => Promise<void>
  createInvite: (opts?: { expiresInSeconds?: number; maxUses?: number }) => Promise<CreateInviteResult>
  revokeInvite: (inviteId: string) => Promise<void>

  sendHeartbeat: (body: { chapterId?: string | null; percent?: number | null; showProgress?: boolean }) => void
  toggleMyProgress: (show: boolean) => Promise<void>
}

const RoomContext = createContext<RoomContextValue | null>(null)

export function RoomProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [roomId, setRoomId] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomView | null>(null)
  const [members, setMembers] = useState<RoomMemberView[]>([])
  const [sharedHighlights, setSharedHighlights] = useState<SharedHighlightView[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cursorRef = useRef<string | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const heartbeatTimerRef = useRef<number | null>(null)
  const lastHeartbeatBodyRef = useRef<{ chapterId?: string | null; percent?: number | null; showProgress?: boolean }>({})
  const heartbeatDebounceRef = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
    if (heartbeatDebounceRef.current) {
      clearTimeout(heartbeatDebounceRef.current)
      heartbeatDebounceRef.current = null
    }
  }, [])

  const fetchState = useCallback(async (rid: string) => {
    try {
      const since = cursorRef.current ?? undefined
      const state = await getRoomState(rid, since)
      setMembers(state.members)
      setSharedHighlights(prev => {
        // Merge by id, dedupe — server returns incremental since cursor
        const byId = new Map(prev.map(h => [h.id, h]))
        for (const h of state.highlights) byId.set(h.id, h)
        for (const del of state.highlightDeletes) byId.delete(del)
        return Array.from(byId.values())
      })
      cursorRef.current = state.cursor
      setIsConnected(true)
      setError(null)
    } catch (e) {
      // Room closed or vanished — deactivate so UI doesn't keep polling ghosts.
      if (e instanceof ApiError && (e.status === 410 || e.status === 404)) {
        setRoomId(null)
        setRoom(null)
        setMembers([])
        setSharedHighlights([])
        cursorRef.current = null
        setIsConnected(false)
        setError(e.status === 410 ? 'room_closed' : 'room_not_found')
        lastHeartbeatBodyRef.current = {}
        return
      }
      setIsConnected(false)
      setError(e instanceof Error ? e.message : 'state error')
    }
  }, [])

  // Polling loop — only when tab visible + roomId present.
  useEffect(() => {
    if (!roomId) {
      stopPolling()
      return
    }

    let cancelled = false

    const tick = () => {
      if (cancelled || document.hidden) return
      void fetchState(roomId)
    }

    // initial load: full state + room view
    const boot = async () => {
      try {
        const r = await apiGetRoom(roomId)
        if (!cancelled) {
          setRoom(r)
          setMembers(r.members)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'room error')
      }
      cursorRef.current = null
      setSharedHighlights([])
      tick()
    }

    void boot()

    pollTimerRef.current = window.setInterval(tick, POLL_MS)

    const onVisibility = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      stopPolling()
    }
  }, [roomId, fetchState, stopPolling])

  // Heartbeat loop — 30s interval while visible.
  useEffect(() => {
    if (!roomId) return

    const beat = () => {
      if (document.hidden) return
      void apiHeartbeat(roomId, lastHeartbeatBodyRef.current).catch(() => {})
    }

    heartbeatTimerRef.current = window.setInterval(beat, HEARTBEAT_MS)
    beat()

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current)
        heartbeatTimerRef.current = null
      }
    }
  }, [roomId])

  const sendHeartbeat = useCallback(
    (body: { chapterId?: string | null; percent?: number | null; showProgress?: boolean }) => {
      lastHeartbeatBodyRef.current = { ...lastHeartbeatBodyRef.current, ...body }
      if (!roomId) return
      // debounce immediate send on change by 2s
      if (heartbeatDebounceRef.current) clearTimeout(heartbeatDebounceRef.current)
      heartbeatDebounceRef.current = window.setTimeout(() => {
        if (!roomId) return
        void apiHeartbeat(roomId, lastHeartbeatBodyRef.current).catch(() => {})
      }, 2000)
    },
    [roomId]
  )

  const clearError = useCallback(() => setError(null), [])

  const setActiveRoom = useCallback((rid: string | null) => {
    setRoomId(rid)
    if (!rid) {
      setRoom(null)
      setMembers([])
      setSharedHighlights([])
      cursorRef.current = null
      setIsConnected(false)
      setError(null)
      lastHeartbeatBodyRef.current = {}
    }
  }, [])

  const createRoom: RoomContextValue['createRoom'] = useCallback(async (targetType, targetId, name) => {
    const res = await apiCreateRoom(targetType, targetId, name)
    setActiveRoom(res.roomId)
    return res.roomId
  }, [setActiveRoom])

  const joinRoom: RoomContextValue['joinRoom'] = useCallback(async (token) => {
    const res = await apiJoinRoom(token)
    setActiveRoom(res.roomId)
    return res.roomId
  }, [setActiveRoom])

  const leaveRoom = useCallback(async () => {
    if (!roomId) return
    await apiLeaveRoom(roomId)
    setActiveRoom(null)
  }, [roomId, setActiveRoom])

  const closeRoom = useCallback(async () => {
    if (!roomId) return
    await apiCloseRoom(roomId)
    setActiveRoom(null)
  }, [roomId, setActiveRoom])

  const createInvite: RoomContextValue['createInvite'] = useCallback(async (opts) => {
    if (!roomId) throw new Error('no active room')
    return apiCreateInvite(roomId, opts)
  }, [roomId])

  const revokeInvite = useCallback(async (inviteId: string) => {
    if (!roomId) return
    await apiRevokeInvite(roomId, inviteId)
  }, [roomId])

  const toggleMyProgress = useCallback(async (show: boolean) => {
    if (!roomId) return
    lastHeartbeatBodyRef.current.showProgress = show
    await apiHeartbeat(roomId, lastHeartbeatBodyRef.current)
    await fetchState(roomId)
  }, [roomId, fetchState])

  const value = useMemo<RoomContextValue>(() => {
    const isOwner = !!room && !!user && room.ownerUserId === user.id
    return {
      roomId, room, members, sharedHighlights, isOwner, isConnected, error,
      setActiveRoom, clearError, createRoom, joinRoom, leaveRoom, closeRoom,
      createInvite, revokeInvite, sendHeartbeat, toggleMyProgress,
    }
  }, [roomId, room, members, sharedHighlights, isConnected, error, user,
      setActiveRoom, clearError, createRoom, joinRoom, leaveRoom, closeRoom,
      createInvite, revokeInvite, sendHeartbeat, toggleMyProgress])

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}

export function useRoom() {
  const ctx = useContext(RoomContext)
  if (!ctx) throw new Error('useRoom must be used within RoomProvider')
  return ctx
}

export function isMemberOnline(member: RoomMemberView): boolean {
  return Date.now() - new Date(member.lastSeenAt).getTime() < PRESENCE_MS
}
