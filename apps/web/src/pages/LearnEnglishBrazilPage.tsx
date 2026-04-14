import { CountryLandingPage } from '../components/landing/CountryLandingPage'

export function LearnEnglishBrazilPage() {
  return (
    <CountryLandingPage
      countryCode="pt-BR"
      countryEnglishName="Brazil"
      audienceLabel="Brazilian learners"
      seo={{
        title: 'Read English Books Without Losing the Flow — For Brazilian Learners',
        description:
          'Free reader built for Brazilian learners. Tap any word for an instant Portuguese translation. Read real books, not excerpts. Build fluency through volume, not drills.',
      }}
      hero={{
        h1: 'Read English books without losing the flow',
        subhead:
          'Built for Brazilian learners who want real reading practice — without stopping every sentence to look up a word.',
        ctaLabel: 'Start reading free',
      }}
      painBullets={[
        {
          title: 'Every unknown word breaks your focus',
          body:
            'You open a book, hit an unfamiliar word, and switch to a dictionary app. Five minutes later, you forgot what the paragraph was about.',
        },
        {
          title: 'Translator apps pull you out of the book',
          body:
            'Copy, paste, wait for a translation, switch back. The reading rhythm is gone. The story does not feel like a story anymore.',
        },
        {
          title: 'Reading in English becomes a chore, so you stop',
          body:
            'Without flow, reading feels like homework. You close the book after 10 pages and tell yourself "next weekend" — and next weekend never comes.',
        },
      ]}
      solutionSteps={[
        {
          title: 'Tap a word — see Portuguese in a flash',
          body:
            'Every word in every book is tappable. You see the translation and definition in under a second, right next to the word.',
        },
        {
          title: 'Keep reading, keep the rhythm',
          body:
            'No tab switching. No context loss. You stay inside the story. The word goes into your vocabulary automatically.',
        },
        {
          title: 'Vocabulary grows from books you actually read',
          body:
            'The words you save are reviewed with spaced repetition. You remember them because you met them in real sentences, not flashcards.',
        },
      ]}
      whyItWorks={{
        title: 'Why reading beats drills',
        body:
          'Real fluency comes from thousands of hours of reading in the target language. Brazilian learners who hit B2 and beyond do it through books, not worksheets. TextStack Reader removes the friction that stops most people at chapter two.',
      }}
      faqs={[
        {
          q: 'Is it free?',
          a:
            'Yes. The reader, Portuguese translations, vocabulary review, and the full public library are free. No credit card needed.',
        },
        {
          q: 'Can I upload my own EPUB or PDF?',
          a:
            'Yes. Upload any EPUB, PDF, or FB2 file and read it the same way — tap words, save vocabulary, track progress.',
        },
        {
          q: 'Does it work on my phone?',
          a:
            'Yes. Works in any modern browser on iPhone, Android, tablet, or desktop. There is also a native mobile app.',
        },
        {
          q: 'Will it translate full sentences too?',
          a:
            'Yes. Select any phrase or sentence and get a full Portuguese translation inline, without leaving the book.',
        },
        {
          q: 'Do I need to create an account?',
          a:
            'No. You can start reading immediately as a guest. Sign up only when you want to sync progress across devices or save unlimited vocabulary.',
        },
        {
          q: 'Is the Portuguese translation European or Brazilian?',
          a:
            'Brazilian Portuguese. The dictionary and translation service are tuned to Brazilian Portuguese usage.',
        },
      ]}
      otherCountries={[
        { slug: '/learn-english-spain', label: 'Spain' },
      ]}
    />
  )
}
