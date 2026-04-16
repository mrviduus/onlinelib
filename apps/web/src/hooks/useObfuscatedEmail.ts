import { useMemo } from 'react'

/**
 * Returns the contact email and mailto href assembled at runtime.
 *
 * Why: Cloudflare Email Protection rewrites plain-text emails and mailto: links
 * in the HTML to `/cdn-cgi/l/email-protection` URLs. Those URLs require JS to
 * decode and return 404 for crawlers (Ahrefs, Googlebot), causing broken-link
 * reports. Building the string in JS prevents Cloudflare from detecting it.
 */
export function useObfuscatedEmail() {
  return useMemo(() => {
    const user = 'vasyl.vdov'
    const domain = 'gmail.com'
    const email = `${user}@${domain}`
    const mailto = `mailto:${email}`
    return { email, mailto }
  }, [])
}
