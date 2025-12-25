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
      primary: '#1a1a1a',
      secondary: '#333333',
      accent: '#0066CC',
      background: '#FFFFFF',
      text: '#1a1a1a',
    },
  },
  programming: {
    name: 'TextStack',
    logo: '/logos/programming.svg',
    tagline: 'Read anything',
    colors: {
      primary: '#1a1a1a',
      secondary: '#333333',
      accent: '#0066CC',
      background: '#FFFFFF',
      text: '#1a1a1a',
    },
  },
  default: {
    name: 'TextStack',
    logo: '/logos/textstack.svg',
    tagline: 'Read anything',
    colors: {
      primary: '#1a1a1a',
      secondary: '#333333',
      accent: '#0066CC',
      background: '#FFFFFF',
      text: '#1a1a1a',
    },
  },
}

export function getSiteTheme(siteCode: string): SiteTheme {
  return siteThemes[siteCode] || siteThemes.default
}
