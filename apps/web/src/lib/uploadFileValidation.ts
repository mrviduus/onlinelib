export const ACCEPTED_EXTENSIONS = ['epub', 'pdf'] as const

export const ACCEPT_ATTR = '.epub,.pdf'

const MIME_HINTS: ReadonlyArray<string> = [
  'application/epub+zip',
  'application/pdf',
  'application/zip',
]

function getExt(name: string): string {
  const n = name.toLowerCase()
  const idx = n.lastIndexOf('.')
  return idx === -1 ? '' : n.slice(idx + 1)
}

export function isUploadableFile(file: File | { name: string; type?: string }): boolean {
  const ext = getExt(file.name)
  if ((ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) return true
  // mimetype is unreliable, treat as soft hint only
  return Boolean(file.type && MIME_HINTS.includes(file.type))
}

export function partitionFiles(files: ArrayLike<File>): { valid: File[]; invalid: File[] } {
  const valid: File[] = []
  const invalid: File[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    if (isUploadableFile(f)) valid.push(f)
    else invalid.push(f)
  }
  return { valid, invalid }
}
