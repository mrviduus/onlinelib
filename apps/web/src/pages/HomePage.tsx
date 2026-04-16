import { SeoHead } from '../components/SeoHead'
import { HeroSection } from '../components/home/HeroSection'
import { FeaturesSection } from '../components/home/FeaturesSection'
import { StatsBar } from '../components/home/StatsBar'
import { RecentAuthorsSection } from '../components/home/RecentAuthorsSection'
import { RecentBooksSection } from '../components/home/RecentBooksSection'
import { TestimonialsSection } from '../components/home/TestimonialsSection'
import { ComparisonSection } from '../components/home/ComparisonSection'
import { FaqSection } from '../components/home/FaqSection'
import { FinalCtaSection } from '../components/home/FinalCtaSection'
import { Footer } from '../components/Footer'
import { useTranslation } from '../hooks/useTranslation'
import '../styles/home.css'

export function HomePage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="home-page">
        <SeoHead
          title={t('home.hero.seoTitle')}
          description={t('home.hero.seoDescription')}
        />
        <HeroSection />
        <FeaturesSection />
        <StatsBar />
        <RecentBooksSection />
        <RecentAuthorsSection />
        <TestimonialsSection />
        <ComparisonSection />
        <FaqSection />
        <FinalCtaSection />
      </div>
      <Footer />
    </>
  )
}
