export interface SiteTheme {
  name: string
  logo: string
  tagline: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
}

export const siteThemes: Record<string, SiteTheme> = {
  general: {
    name: 'TextStack',
    logo: '/logos/textstack.svg',
    tagline: 'Read anything',
    colors: {
      primary: '#F97316',
      secondary: '#FDBA74',
      accent: '#F97316',
      background: '#FFFFFF',
      text: '#1a1a1a',
    },
  },
  programming: {
    name: 'TextStack',
    logo: '/logos/programming.svg',
    tagline: 'Read anything',
    colors: {
      primary: '#2563EB',
      secondary: '#60A5FA',
      accent: '#2563EB',
      background: '#FFFFFF',
      text: '#1a1a1a',
    },
  },
  default: {
    name: 'TextStack',
    logo: '/logos/textstack.svg',
    tagline: 'Read anything',
    colors: {
      primary: '#F97316',
      secondary: '#FDBA74',
      accent: '#F97316',
      background: '#FFFFFF',
      text: '#1a1a1a',
    },
  },
}

export function getSiteTheme(siteCode: string): SiteTheme {
  return siteThemes[siteCode] || siteThemes.default
}
