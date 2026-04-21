import { describe, it, expect } from 'vitest'
import {
  extractThemes,
  estimateReadingTime,
  extractYear,
  generateFAQs,
} from './bookSeo'
import type { BookDetail, ChapterSummary } from '../types/api'

// Simple identity t() for testing — returns the key's English value
const mockT = (key: string): string => {
  const translations: Record<string, string> = {
    'bookDetail.readingTimeMinutes': '{minutes} minutes',
    'bookDetail.readingTimeHour': '1 hour',
    'bookDetail.readingTimeHours': '{hours} hours',
    'bookDetail.readingTimeUnknown': 'Unknown',
    'bookDetail.faqWhoWrote': 'Who wrote {title}?',
    'bookDetail.faqWhoWroteAnswer': '{title} was written by {author}.',
    'bookDetail.faqChapters': 'How many chapters are in {title}?',
    'bookDetail.faqChaptersAnswer': '{title} contains {count} chapters.',
    'bookDetail.faqReadingTime': 'How long does it take to read {title}?',
    'bookDetail.faqReadingTimeAnswer': 'The estimated reading time for {title} is {time}.',
    'bookDetail.faqPublished': 'When was {title} published?',
    'bookDetail.faqPublishedAnswer': '{title} was first published in {year}.',
    'bookDetail.faqFree': 'Can I read {title} for free?',
    'bookDetail.faqFreeAnswer': 'Yes, {title} is available to read for free on TextStack Reader.',
    'bookDetail.faqLanguages': 'Is {title} available in other languages?',
    'bookDetail.faqLanguagesYes': 'Yes, {title} is available in {count} language(s) on TextStack Reader.',
    'bookDetail.faqLanguagesNo': 'Currently {title} is only available in {lang} on TextStack Reader.',
    'books.unknown': 'Unknown',
  }
  return translations[key] || key
}

describe('extractThemes', () => {
  it('extracts keywords by frequency', () => {
    const desc = 'Crime and punishment. The crime was severe. Punishment followed crime.'
    const themes = extractThemes(desc, 2)
    expect(themes).toContain('Crime')
    expect(themes).toContain('Punishment')
  })

  it('filters stopwords', () => {
    const desc = 'The man and the woman were in the house'
    const themes = extractThemes(desc)
    expect(themes).not.toContain('The')
    expect(themes).not.toContain('And')
    expect(themes).toContain('Woman')
    expect(themes).toContain('House')
  })

  it('handles null description', () => {
    expect(extractThemes(null)).toEqual([])
  })

  it('limits count', () => {
    const desc = 'love guilt redemption suffering isolation identity power freedom'
    expect(extractThemes(desc, 3)).toHaveLength(3)
  })
})

describe('estimateReadingTime', () => {
  it('calculates hours for long books', () => {
    const chapters: ChapterSummary[] = [
      { id: '1', chapterNumber: 1, slug: 'ch1', title: 'Ch1', wordCount: 50000 },
      { id: '2', chapterNumber: 2, slug: 'ch2', title: 'Ch2', wordCount: 50000 },
    ]
    expect(estimateReadingTime(chapters, mockT)).toBe('7 hours')
  })

  it('returns minutes for short chapters', () => {
    const chapters: ChapterSummary[] = [
      { id: '1', chapterNumber: 1, slug: 'ch1', title: 'Ch1', wordCount: 2500 },
    ]
    expect(estimateReadingTime(chapters, mockT)).toBe('10 minutes')
  })

  it('handles missing wordCount', () => {
    const chapters: ChapterSummary[] = [
      { id: '1', chapterNumber: 1, slug: 'ch1', title: 'Ch1', wordCount: null },
    ]
    expect(estimateReadingTime(chapters, mockT)).toBe('Unknown')
  })
})

describe('extractYear', () => {
  it('parses ISO date', () => {
    expect(extractYear('2023-05-15T00:00:00Z')).toBe(2023)
  })

  it('returns null for missing date', () => {
    expect(extractYear(null)).toBeNull()
  })

  it('returns null for invalid date', () => {
    expect(extractYear('not-a-date')).toBeNull()
  })
})

describe('generateFAQs', () => {
  const mockBook: BookDetail = {
    id: '1',
    slug: 'test-book',
    title: 'Test Book',
    language: 'en',
    description: 'A test book description',
    coverPath: null,
    publishedAt: '1866-01-01T00:00:00Z',
    isPublicDomain: true,
    seoTitle: null,
    seoDescription: null,
    seoRelevanceText: null,
    seoThemesJson: null,
    seoFaqsJson: null,
    chapters: [
      { id: '1', chapterNumber: 1, slug: 'ch1', title: 'Ch1', wordCount: 5000 },
      { id: '2', chapterNumber: 2, slug: 'ch2', title: 'Ch2', wordCount: 5000 },
    ],
    otherEditions: [{ slug: 'test-de', language: 'de', title: 'Testbuch' }],
    authors: [{ id: '1', slug: 'author', name: 'Test Author', role: 'author' }],
    genres: [],
    moreByAuthor: [],
    avgRating: null,
    ratingCount: 0,
    reviewCount: 0,
  }

  it('returns 6 FAQs when year available', () => {
    const faqs = generateFAQs(mockBook, mockT)
    expect(faqs.length).toBe(6)
    expect(faqs.some((f) => f.question.includes('published'))).toBe(true)
  })

  it('returns 5 FAQs when no year', () => {
    const bookNoYear = { ...mockBook, publishedAt: null }
    const faqs = generateFAQs(bookNoYear, mockT)
    expect(faqs.length).toBe(5)
    expect(faqs.some((f) => f.question.includes('published'))).toBe(false)
  })

  it('includes author name', () => {
    const faqs = generateFAQs(mockBook, mockT)
    const authorFaq = faqs.find((f) => f.question.includes('wrote'))
    expect(authorFaq?.answer).toContain('Test Author')
  })

  it('includes chapter count', () => {
    const faqs = generateFAQs(mockBook, mockT)
    const chapterFaq = faqs.find((f) => f.question.includes('chapters'))
    expect(chapterFaq?.answer).toContain('2 chapters')
  })
})
