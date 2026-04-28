const isDev = import.meta.env.DEV
const env = (key: string): boolean | undefined => {
  const v = (import.meta.env as Record<string, string | undefined>)[key]
  if (v === undefined) return undefined
  return v === 'true' || v === '1'
}

export const features = {
  myBooksV3: {
    headerReframe: env('VITE_FEATURE_MYBOOKSV3_HEADER_REFRAME') ?? isDev,
    libraryShelves: env('VITE_FEATURE_MYBOOKSV3_LIBRARY_SHELVES') ?? isDev,
    librarySidebar: env('VITE_FEATURE_MYBOOKSV3_LIBRARY_SIDEBAR') ?? isDev,
  },
} as const
