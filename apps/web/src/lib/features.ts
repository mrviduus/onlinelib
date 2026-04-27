const isDev = import.meta.env.DEV
const env = (key: string): boolean | undefined => {
  const v = (import.meta.env as Record<string, string | undefined>)[key]
  if (v === undefined) return undefined
  return v === 'true' || v === '1'
}

export const features = {
  myBooksV2: {
    uploadButton: env('VITE_FEATURE_MYBOOKS_V2_UPLOAD_BUTTON') ?? isDev,
    globalDropZone: env('VITE_FEATURE_MYBOOKS_V2_GLOBAL_DROPZONE') ?? isDev,
  },
} as const
