import { useState, useEffect, FormEvent } from 'react'
import { adminApi, Site } from '../api/client'

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('uk')
  const [siteId, setSiteId] = useState('')
  const [sites, setSites] = useState<Site[]>([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    adminApi.getSites().then(data => {
      setSites(data)
      if (data.length > 0) setSiteId(data[0].id)
    })
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return

    setUploading(true)
    setResult(null)

    try {
      const res = await adminApi.uploadBook(file, title || file.name.replace(/\.[^/.]+$/, ''), language, siteId)
      setResult({ success: true, message: `Uploaded! Job ID: ${res.jobId}` })
      setFile(null)
      setTitle('')
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="upload-page">
      <h1>Upload Book</h1>
      <p className="upload-page__subtitle">Upload a book file (EPUB, FB2, PDF, TXT, DJVU) to add to the library.</p>

      <form onSubmit={handleSubmit} className="upload-form">
        <div className="form-group">
          <label htmlFor="site">Site *</label>
          <select
            id="site"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            required
          >
            {sites.map(site => (
              <option key={site.id} value={site.id}>{site.name || site.code}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="file">Book File *</label>
          <input
            type="file"
            id="file"
            accept=".epub,.fb2,.pdf,.txt,.md,.djvu"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
          />
          {file && <span className="file-name">{file.name}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="title">Title (optional)</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Auto-detected from file if empty"
          />
        </div>

        <div className="form-group">
          <label htmlFor="language">Language *</label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            required
          >
            <option value="en">English</option>
            <option value="uk">Ukrainian</option>
            <option value="de">German</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
          </select>
        </div>

        <button type="submit" disabled={!file || uploading} className="submit-btn">
          {uploading ? 'Uploading...' : 'Upload Book'}
        </button>
      </form>

      {result && (
        <div className={`result ${result.success ? 'result--success' : 'result--error'}`}>
          {result.message}
        </div>
      )}
    </div>
  )
}
