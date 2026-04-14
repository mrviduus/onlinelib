import { SeoArticlePage } from '../components/landing/SeoArticlePage'
import { DEMO_BOOK } from '../config/demoBook'

const DEMO_PATH = `/books/${DEMO_BOOK.bookSlug}/${DEMO_BOOK.chapterSlug}`

export function ReadBooksInEnglishPage() {
  return (
    <SeoArticlePage
      pageKey="read-books-in-english"
      seo={{
        title: 'Read Books in English Without Translating Every Word',
        description:
          'Learn how to read books in English without constantly translating. Discover a better way to build fluency using real books and smart tools.',
      }}
      hero={{
        h1: 'Read Books in English Without Translating Every Word',
        subhead:
          'A better way to build English fluency through real books — without stopping every sentence.',
      }}
      sections={[
        {
          heading: "Reading in English shouldn't feel like homework",
          body:
            "You open the book. You hit a word you don't know. You grab a dictionary. Two pages later, you've lost the story. Most English learners stop reading not because the book is boring, but because the constant translation breaks the flow.",
        },
        {
          heading: 'Why this happens',
          body:
            'When every sentence has an unknown word, your brain spends more energy decoding than understanding. You read slower. You remember less. The book stops feeling like a book and starts feeling like a drill. Most readers quit by chapter two.',
        },
        {
          heading: 'What actually works',
          body:
            "Fluent readers don't translate every word. They skip unknowns, use context, and look up only what matters. Vocabulary grows from thousands of real sentences — not flashcards. The trick is staying in flow long enough for your brain to learn from exposure.",
        },
        {
          heading: 'A reader built for flow',
          body:
            'TextStack Reader is a reading app that lets you read books in English with instant translation on tap. Tap any word — see its meaning without leaving the page. Keep reading. The word you tapped goes into your vocabulary automatically and comes back for spaced-repetition review later. You read more. You translate less. Your English grows.',
        },
      ]}
      cta={{
        label: 'Start reading with TextStack Reader',
        href: DEMO_PATH,
      }}
      relatedLinks={[
        { href: '/', label: '← TextStack Reader home' },
        { href: '/books-with-translation', label: 'Books with translation for English learners →' },
      ]}
    />
  )
}
