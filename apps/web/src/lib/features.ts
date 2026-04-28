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
    continueReading: env('VITE_FEATURE_MYBOOKS_V2_CONTINUE_READING') ?? isDev,
    editMetadata: env('VITE_FEATURE_MYBOOKS_V2_EDIT_METADATA') ?? isDev,
    tags: env('VITE_FEATURE_MYBOOKS_V2_TAGS') ?? isDev,
    collections: env('VITE_FEATURE_MYBOOKS_V2_COLLECTIONS') ?? isDev,
    bulkSelect: env('VITE_FEATURE_MYBOOKS_V2_BULK_SELECT') ?? isDev,
    bookStats: env('VITE_FEATURE_MYBOOKS_V2_BOOK_STATS') ?? isDev,
    contentSearch: env('VITE_FEATURE_MYBOOKS_V2_CONTENT_SEARCH') ?? isDev,
    aiTags: env('VITE_FEATURE_MYBOOKS_V2_AI_TAGS') ?? isDev,
    commandPalette: env('VITE_FEATURE_MYBOOKS_V2_COMMAND_PALETTE') ?? isDev,
  },
} as const
