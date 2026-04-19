import { useState, useEffect } from 'react'
import { useRoom, isMemberOnline } from '../../context/RoomContext'
import { useTranslation } from '../../hooks/useTranslation'
import { RoomInviteModal } from './RoomInviteModal'
import { RoomSettingsModal } from './RoomSettingsModal'

export function RoomTopBar() {
  const {
    roomId, room, members, isOwner, isConnected,
    inviteOpen, setInviteOpen,
  } = useRoom()
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Once auto-opened, strip ?openInvite=1 from URL so reload doesn't re-trigger.
  useEffect(() => {
    if (!inviteOpen) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('openInvite') === '1') {
      params.delete('openInvite')
      const qs = params.toString()
      const next = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
      window.history.replaceState(null, '', next)
    }
  }, [inviteOpen])

  if (!roomId || !room) return null

  return (
    <>
      <div className="room-topbar" role="status" aria-label={t('rooms.topBarLabel')}>
        <span className="room-topbar__dot" data-online={isConnected} title={isConnected ? 'connected' : 'disconnected'} />
        <span className="room-topbar__name">{room.name ?? t('rooms.defaultName')}</span>
        <ul className="room-topbar__members">
          {members.slice(0, 8).map(m => (
            <li key={m.userId} title={m.userName ?? t('rooms.anonymous')} style={{ background: m.color }}>
              <span className="room-topbar__avatar-letter">
                {(m.userName ?? '?').charAt(0).toUpperCase()}
              </span>
              <span className="room-topbar__presence" data-online={isMemberOnline(m)} />
            </li>
          ))}
          {members.length > 8 && (
            <li className="room-topbar__more">+{members.length - 8}</li>
          )}
        </ul>
        <button
          className="room-topbar__menu-btn"
          onClick={() => setMenuOpen(v => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
        {menuOpen && (
          <ul className="room-topbar__menu" role="menu">
            <li><button onClick={() => { setInviteOpen(true); setMenuOpen(false) }}>{t('rooms.invite')}</button></li>
            <li><button onClick={() => { setSettingsOpen(true); setMenuOpen(false) }}>{t('rooms.settings')}</button></li>
          </ul>
        )}
      </div>

      {inviteOpen && <RoomInviteModal onClose={() => setInviteOpen(false)} />}
      {settingsOpen && <RoomSettingsModal isOwner={isOwner} onClose={() => setSettingsOpen(false)} />}

      <style>{css}</style>
    </>
  )
}

const css = `
.room-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; font-size: 13px;
  background: var(--reader-bar-bg, #fafafa);
  border-bottom: 1px solid var(--border, #e5e5e5);
  position: fixed; top: 56px; left: 0; right: 0; z-index: 101;
}
.room-topbar__dot { width: 8px; height: 8px; border-radius: 50%; background: #bbb; display:inline-block; }
.room-topbar__dot[data-online='true'] { background: #22c55e; }
.room-topbar__name { font-weight: 500; flex: 0 0 auto; max-width: 200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.room-topbar__members { display:flex; list-style:none; padding:0; margin:0 0 0 auto; gap:-4px; }
.room-topbar__members li {
  position: relative; width: 26px; height: 26px; border-radius: 50%;
  color: #fff; font-size: 11px; font-weight: 600;
  display:flex; align-items:center; justify-content:center;
  margin-left: -6px; border: 2px solid var(--bg, #fff);
}
.room-topbar__more { background: #888 !important; }
.room-topbar__presence {
  position: absolute; bottom: 0; right: 0;
  width: 8px; height: 8px; border-radius: 50%;
  background: #bbb; border: 2px solid var(--bg, #fff);
}
.room-topbar__presence[data-online='true'] { background: #22c55e; }
.room-topbar__menu-btn {
  background: none; border: none; cursor: pointer; font-size: 18px; padding: 2px 8px;
  color: var(--text, #222);
}
.room-topbar__menu {
  position: absolute; top: 100%; right: 8px; z-index: 100;
  background: var(--bg, #fff); border: 1px solid var(--border, #e5e5e5);
  border-radius: 6px; list-style:none; padding: 4px 0; margin: 4px 0 0;
  min-width: 140px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.room-topbar__menu li button {
  width: 100%; text-align: left; padding: 8px 12px;
  background: none; border: none; cursor: pointer; font-size: 13px;
  color: var(--text, #222);
}
.room-topbar__menu li button:hover { background: var(--hover, #f3f4f6); }
`
