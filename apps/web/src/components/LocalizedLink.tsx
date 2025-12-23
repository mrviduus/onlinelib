import { Link, LinkProps } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'

interface LocalizedLinkProps extends Omit<LinkProps, 'to'> {
  to: string
}

export function LocalizedLink({ to, children, ...props }: LocalizedLinkProps) {
  const { getLocalizedPath } = useLanguage()
  return (
    <Link to={getLocalizedPath(to)} {...props}>
      {children}
    </Link>
  )
}
