export interface Edition {
  id: string
  slug: string
  title: string
  language: string
  authorsJson: string | null
  description: string | null
  coverPath: string | null
  publishedAt: string | null
  chapterCount: number
}

export interface ChapterSummary {
  id: string
  chapterNumber: number
  slug: string
  title: string
  wordCount: number | null
}

export interface ChapterNav {
  slug: string
  title: string
}

export interface Chapter {
  id: string
  chapterNumber: number
  slug: string
  title: string
  html: string
  wordCount: number | null
  prev: ChapterNav | null
  next: ChapterNav | null
}

export interface BookDetail {
  id: string
  slug: string
  title: string
  language: string
  authorsJson: string | null
  description: string | null
  coverPath: string | null
  publishedAt: string | null
  chapters: ChapterSummary[]
  otherEditions: { slug: string; language: string; title: string }[]
}

export interface SearchEdition {
  id: string
  slug: string
  title: string
  language: string
  authorsJson: string | null
  coverPath: string | null
}

export interface SearchResult {
  chapterId: string
  chapterSlug: string | null
  chapterTitle: string | null
  chapterNumber: number
  edition: SearchEdition
  highlights: string[] | null
}

export interface Suggestion {
  text: string
  slug: string
  authorsJson: string | null
  coverPath: string | null
  score: number
}
