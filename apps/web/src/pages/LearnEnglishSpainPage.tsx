import { CountryLandingPage } from '../components/landing/CountryLandingPage'

export function LearnEnglishSpainPage() {
  return (
    <CountryLandingPage
      countryCode="es"
      countryEnglishName="Spain"
      audienceLabel="Spanish speakers"
      seo={{
        title: 'Read English Books Without the Dictionary Tab — For Spanish Speakers',
        description:
          'Free reader built for Spanish speakers learning English. Tap any word for an instant Spanish translation. Read real books. Build fluency through volume.',
      }}
      hero={{
        h1: 'Read English books without the dictionary tab',
        subhead:
          'For Spanish speakers who want real English fluency — through real books, not another grammar app.',
        ctaLabel: 'Start reading free',
      }}
      painBullets={[
        {
          title: 'Reading should not feel like dictionary work',
          body:
            'You want to enjoy the book. Instead, you spend half the session typing words into a translator and scrolling definitions.',
        },
        {
          title: 'Switching tabs breaks immersion',
          body:
            'Every lookup pulls you out of the story. By the time you get back to the paragraph, the tension is gone.',
        },
        {
          title: 'You forget the word the next day',
          body:
            'You look up the same word five times across a book. Nothing sticks. No system captures what you looked up.',
        },
      ]}
      solutionSteps={[
        {
          title: 'Tap → Spanish translation inline',
          body:
            'Tap any English word to see the Spanish meaning right next to it. No tab switching. No copy-paste. The story never stops.',
        },
        {
          title: 'Words save themselves, review builds fluency',
          body:
            'Every word you tap enters a spaced-repetition queue. A few minutes a day and the vocabulary you actually encountered is the vocabulary you actually keep.',
        },
        {
          title: 'Real books, not beginner excerpts',
          body:
            'Read full novels, essays, and non-fiction. Cognates between Spanish and English mean you will read faster than you think — if you stop getting stuck.',
        },
      ]}
      whyItWorks={{
        title: 'Your cognate advantage',
        body:
          'Spanish and English share thousands of cognates. Spanish speakers already understand more English than they realize. TextStack Reader removes the friction so that latent understanding turns into real reading speed — and real fluency.',
      }}
      faqs={[
        {
          q: '¿Es gratis?',
          a:
            'Yes. The reader, Spanish translations, vocabulary review, and the full public library are free. No credit card required.',
        },
        {
          q: 'Can I upload my own EPUB or PDF?',
          a:
            'Yes. Any EPUB, PDF, or FB2 file works the same way as the public books — tap words, save vocabulary, track progress.',
        },
        {
          q: 'Does it work on my phone?',
          a:
            'Yes. Any modern mobile browser works, and a native mobile app is available as well.',
        },
        {
          q: 'Will it translate whole sentences?',
          a:
            'Yes. Select any phrase or sentence and get a full Spanish translation inline, without leaving the book.',
        },
        {
          q: 'Is it European Spanish or Latin American Spanish?',
          a:
            'Translations default to European Spanish (Castellano). Most vocabulary and definitions are shared across variants.',
        },
        {
          q: 'Do I need to sign up?',
          a:
            'No. You can start reading right away — no account needed. Sign up later when you want to sync across devices or unlock unlimited vocabulary saving.',
        },
      ]}
      otherCountries={[
        { slug: '/learn-english-brazil', label: 'Brazil' },
      ]}
    />
  )
}
