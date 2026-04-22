import { useState, useEffect, useCallback } from 'react'
import { uploadUserBook, getStorageQuota, type StorageQuota } from '../../api/userBooks'

interface UploadSectionProps {
  onUploadComplete: () => void
}

export function UploadSection({ onUploadComplete }: UploadSectionProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [quota, setQuota] = useState<StorageQuota | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [ownsRights, setOwnsRights] = useState(false)

  // Fetch quota on mount
  useEffect(() => {
    getStorageQuota()
      .then(setQuota)
      .catch(() => {})
  }, [])

  const handleUpload = useCallback(async (file: File) => {
    if (!ownsRights) {
      setError('Please confirm you own the rights or the book is in the public domain.')
      return
    }
    setError(null)
    setIsUploading(true)
    setUploadProgress(0)

    try {
      await uploadUserBook(file, undefined, undefined, (percent) => {
        setUploadProgress(percent)
      })
      onUploadComplete()
      // Refresh quota after upload
      getStorageQuota().then(setQuota).catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }, [onUploadComplete, ownsRights])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleUpload(file)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }, [handleUpload])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      handleUpload(file)
    }
  }, [handleUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  return (
    <div className="upload-section">
      <label className="upload-section__rights">
        <input
          type="checkbox"
          checked={ownsRights}
          onChange={(e) => setOwnsRights(e.target.checked)}
          disabled={isUploading}
        />
        <span>I own the rights to this book or it is in the public domain.</span>
      </label>
      <div
        className={`upload-section__dropzone ${isDragging ? 'upload-section__dropzone--dragging' : ''} ${isUploading ? 'upload-section__dropzone--uploading' : ''} ${!ownsRights ? 'upload-section__dropzone--disabled' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept=".epub,.pdf,.fb2"
          onChange={handleFileSelect}
          disabled={isUploading || !ownsRights}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: ownsRights ? 'pointer' : 'not-allowed', zIndex: 2 }}
        />

        {isUploading ? (
          <div className="upload-section__progress">
            <div className="upload-section__progress-bar">
              <div
                className="upload-section__progress-fill"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span>{Math.round(uploadProgress)}% uploading...</span>
          </div>
        ) : (
          <>
            <svg className="upload-section__icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="upload-section__text">
              Drop EPUB, PDF or FB2 here
            </p>
            <p className="upload-section__subtext">
              or click to browse
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="upload-section__error">
          {error}
        </div>
      )}

      {quota && (
        <div className="upload-section__quota">
          <div className="upload-section__quota-bar">
            <div
              className="upload-section__quota-fill"
              style={{ width: `${Math.min(quota.usedPercent, 100)}%` }}
            />
          </div>
          <span className="upload-section__quota-text">
            {formatBytes(quota.usedBytes)} / {formatBytes(quota.limitBytes)} used
          </span>
        </div>
      )}
    </div>
  )
}
