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
    name: 'General',
    logo: '/logos/general.svg',
    tagline: 'Free online library for everyone',
    colors: {
      primary: '#1a1a1a',
      secondary: '#333333',
      accent: '#0066CC',
      background: '#FFFFFF',
      text: '#1a1a1a',
    },
  },
  programming: {
    name: 'CodeBooks',
    logo: '/logos/programming.svg',
    tagline: 'Learn to code, one chapter at a time',
    colors: {
      primary: '#0066CC',    // blue
      secondary: '#004499',  // dark blue
      accent: '#00CC66',     // green
      background: '#F5F7FA', // light gray
      text: '#1A1A2E',
    },
  },
  default: {
    name: 'OnlineLib',
    logo: '/logos/default.svg',
    tagline: 'Free online library',
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
