export const colors = {
  primary: '#C4704B',
  primaryLight: '#F5E6DE',
  primaryDark: '#A85A3A',
  background: '#FFFFFF',
  bgWarm: '#FDFDFB',
  surface: '#F9FAFB',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  navBg: 'rgba(250, 250, 250, 0.95)',
  // Reader themes
  readerLight: '#FFFFFF',
  readerSepia: '#F4ECD8',
  readerDark: '#1A1A2E',
}

// Deterministic pastel palette used by the home "Collections" carousel.
// Kept outside `colors` because it's a fixed wheel (cards pick by slug
// hash) rather than a semantic token. Dark variants are desaturated /
// darkened equivalents of each light pastel so the same slug still maps
// to a visually related card across themes.
export const collectionTilesLight = [
  '#FDE7E3', // blush
  '#E3F0FD', // sky
  '#E8F3E6', // sage
  '#FFF4D6', // butter
  '#F1E7FB', // lilac
  '#FEE5D1', // apricot
  '#E3F4F1', // mint
  '#FBE7F2', // rose
]

export const collectionTilesDark = [
  '#4A2B26', // blush → deep terracotta
  '#1F2E42', // sky → midnight blue
  '#2A3A26', // sage → forest
  '#4A3F1D', // butter → bronze
  '#2E2340', // lilac → plum
  '#4A2F1D', // apricot → burnt sienna
  '#1D3A36', // mint → teal
  '#402334', // rose → mulberry
]

export const collectionTileText = {
  light: '#1F2937',
  dark: '#F4EAD5',
}

export const darkColors: typeof colors = {
  primary: '#D4885F',
  primaryLight: '#3D2A1E',
  primaryDark: '#E8A07A',
  background: '#111827',
  bgWarm: '#0F1420',
  surface: '#1F2937',
  text: '#F9FAFB',
  textSecondary: '#9CA3AF',
  border: '#374151',
  error: '#F87171',
  success: '#34D399',
  warning: '#FBBF24',
  navBg: 'rgba(17, 24, 39, 0.95)',
  readerLight: '#FFFFFF',
  readerSepia: '#F4ECD8',
  readerDark: '#1A1A2E',
}
