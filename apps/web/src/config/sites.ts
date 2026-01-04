export type SiteTheme = {
  name: string
  logo: string
  favicon: string
}

export const siteThemes: Record<string, SiteTheme> = {
  general: {
    name: 'TextStack',
    logo: '/logo.svg',
    favicon: '/favicon.svg',
  },
  programming: {
    name: 'TextStack dev',
    logo: '/logo-dev.svg',
    favicon: '/favicon.svg',
  },
}

export const defaultTheme = siteThemes.general
