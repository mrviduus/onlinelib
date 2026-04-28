import { UploadForm } from './UploadForm'

interface UploadSectionProps {
  onUploadComplete: () => void
}

export function UploadSection({ onUploadComplete }: UploadSectionProps) {
  return <UploadForm onUploadComplete={() => onUploadComplete()} />
}
