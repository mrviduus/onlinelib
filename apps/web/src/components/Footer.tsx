import { LocalizedLink } from './LocalizedLink'
import { useTranslation } from '../hooks/useTranslation'

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__description">
          {t('footer.description')}
        </p>
        <nav className="site-footer__content-links">
          <LocalizedLink to="/books" className="site-footer__link">{t('nav.library')}</LocalizedLink>
          <LocalizedLink to="/authors" className="site-footer__link">{t('footer.authors')}</LocalizedLink>
          <LocalizedLink to="/genres" className="site-footer__link">{t('nav.genres')}</LocalizedLink>
          <LocalizedLink to="/blog" className="site-footer__link">{t('blog.title')}</LocalizedLink>
        </nav>
        <nav className="site-footer__links">
          <LocalizedLink to="/privacy" className="site-footer__link">{t('footer.privacy')}</LocalizedLink>
          <LocalizedLink to="/terms" className="site-footer__link">{t('footer.terms')}</LocalizedLink>
          <LocalizedLink to="/contact" className="site-footer__link">{t('footer.contact')}</LocalizedLink>
        </nav>
        <div className="site-footer__badges">
          <a
            href="https://fazier.com"
            target="_blank"
            rel="noopener noreferrer"
            className="site-footer__badge"
            aria-label="Featured on Fazier"
          >
            <img
              src="https://fazier.com/api/v1/public/badges/embed_image.svg?badge_type=featured"
              alt="Featured on Fazier"
              width="250"
              height="54"
              loading="lazy"
            />
          </a>
        </div>
        <div className="site-footer__bottom">
          <span className="site-footer__logo">TextStack</span>
          <span className="site-footer__copyright">&copy; {new Date().getFullYear()} TextStack Library Project.</span>
        </div>
      </div>
    </footer>
  )
}
