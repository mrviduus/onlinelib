import { SeoArticlePage } from '../components/landing/SeoArticlePage'
import { DEMO_BOOK } from '../config/demoBook'

const DEMO_PATH = `/books/${DEMO_BOOK.bookSlug}/${DEMO_BOOK.chapterSlug}`

export function BooksWithTranslationPage() {
  return (
    <SeoArticlePage
      pageKey="books-with-translation"
      seo={{
        title: 'Books with Translation for English Learners',
        description:
          'Looking for books with translation? Learn how to read English books with instant word definitions and improve your vocabulary naturally.',
      }}
      hero={{
        h1: 'Books with Translation for English Learners',
        subhead:
          'Read English books with built-in translation — without juggling apps or parallel PDFs.',
      }}
      sections={[
        {
          heading: 'Finding English books with translation is harder than it should be',
          body:
            'You want to read a novel in English, but every unknown word slows you down. So you search for "books with translation" and find bad options: low-quality bilingual PDFs, half-baked browser extensions, or parallel-text sites that read like a DMV form.',
        },
        {
          heading: 'Existing solutions get in the way',
          body:
            'Parallel-text PDFs split your attention — one eye on each column, neither on the story. Google Translate means copy, paste, wait, switch back. Dictionary pop-ups interrupt the sentence. None of them let you actually read.',
        },
        {
          heading: 'A better way: inline translation, not interruption',
          body:
            'What if the translation lived where your finger already was? Tap a word — the meaning appears next to it — keep reading. No tab switching. No copy-paste. The rhythm of the book stays intact.',
        },
        {
          heading: 'TextStack Reader — books with translation, built in',
          body:
            'TextStack Reader lets you read books in English with instant translation, vocabulary tracking, and spaced repetition — all in one reader. The public library has thousands of classics, free, no account required. Upload your own EPUB or PDF and read it the same way. Save words you want to learn. Review them later. Watch your vocabulary grow from books you actually read.',
        },
      ]}
      cta={{
        label: 'Try TextStack Reader',
        href: DEMO_PATH,
      }}
      relatedLinks={[
        { href: '/', label: '← TextStack Reader home' },
        { href: '/read-books-in-english', label: 'Read books in English without translating every word →' },
      ]}
    />
  )
}
