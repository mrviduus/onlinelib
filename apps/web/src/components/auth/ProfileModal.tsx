import { useState, useRef, FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, updateProfile, updateAvatar, deleteAvatar } = useAuth()
  const [name, setName] = useState(user?.name || '')
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  if (!user) return null

  const avatarSrc = preview || (user.picture?.startsWith('http')
    ? user.picture
    : user.picture ? `/storage/${user.picture}` : null)

  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase()

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const handleRemoveAvatar = () => {
    setFile(null)
    setPreview('__remove__')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const trimmedName = name.trim() || null
      if (trimmedName !== user.name) {
        await updateProfile(trimmedName)
      }
      if (file) {
        await updateAvatar(file)
      } else if (preview === '__remove__' && user.picture) {
        await deleteAvatar()
      }
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <button className="profile-modal__close" onClick={onClose}>&times;</button>
        <div className="profile-modal__body">
          <h2 className="profile-modal__title">Edit profile</h2>
          <form onSubmit={handleSubmit}>
            <div className="profile-modal__avatar-section">
              <div className="profile-modal__avatar" onClick={() => fileRef.current?.click()}>
                {avatarSrc && avatarSrc !== '__remove__' ? (
                  <img src={avatarSrc} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span>{initials}</span>
                )}
                <div className="profile-modal__avatar-overlay">
                  <span className="material-icons-outlined">photo_camera</span>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              {(avatarSrc && avatarSrc !== '__remove__') && (
                <button type="button" className="profile-modal__remove-btn" onClick={handleRemoveAvatar}>
                  Remove photo
                </button>
              )}
            </div>
            <label className="profile-modal__label">Name</label>
            <input
              type="text"
              className="profile-modal__input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
            />
            <label className="profile-modal__label">Email</label>
            <input
              type="email"
              className="profile-modal__input profile-modal__input--disabled"
              value={user.email}
              disabled
            />
            {error && <p className="profile-modal__error">{error}</p>}
            <button className="profile-modal__btn" type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
