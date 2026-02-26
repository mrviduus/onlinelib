export interface BookAuthor {
  id: string
  slug: string
  name: string
  role: string
}

export interface Edition {
  id: string
  slug: string
  title: string
  language: string
  description: string | null
  coverPath: string | null
  publishedAt: string | null
  chapterCount: number
  authors: BookAuthor[]
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
  description: string | null
  coverPath: string | null
  publishedAt: string | null
  isPublicDomain: boolean
  seoTitle: string | null
  seoDescription: string | null
  // SEO content blocks
  seoRelevanceText: string | null
  seoThemesJson: string | null
  seoFaqsJson: string | null
  chapters: ChapterSummary[]
  otherEditions: { slug: string; language: string; title: string }[]
  authors: BookAuthor[]
}

export interface SearchEdition {
  id: string
  slug: string
  title: string
  language: string
  authors: string | null
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
  authors: string | null
  coverPath: string | null
  score: number
}

export interface Author {
  id: string
  slug: string
  name: string
  bio: string | null
  photoPath: string | null
  bookCount: number
}

export interface AuthorDetail extends Author {
  seoRelevanceText: string | null
  seoThemesJson: string | null
  seoFaqsJson: string | null
  editions: Edition[]
}

export interface Genre {
  id: string
  slug: string
  name: string
  description: string | null
  bookCount: number
}

export interface GenreDetail extends Genre {
  editions: Edition[]
}

// Auth
export interface UserDto {
  id: string
  email: string
  name: string | null
  picture: string | null
  createdAt: string
}

export interface AuthResponse {
  user: UserDto
}

export interface MobileAuthResponse {
  user: UserDto
  accessToken: string
  refreshToken: string
}

// Reading Progress
export interface ReadingProgressDto {
  editionId: string
  chapterId: string
  chapterSlug: string
  progress: number
  updatedAt: string
}

// Bookmarks
export interface BookmarkDto {
  id: string
  editionId: string
  chapterId: string
  chapterSlug: string
  title: string
  createdAt: string
}

// Vocabulary
export interface VocabularyWordDto {
  id: string
  word: string
  translation: string | null
  definition: string | null
  sentence: string | null
  bookTitle: string | null
  hint: string | null
  stage: number
  nextReviewAt: string | null
  createdAt: string
}

export interface VocabularyStatsDto {
  total: number
  byStage: Record<number, number>
}

export interface ReviewCardDto {
  wordId: string
  word: string
  translation: string | null
  definition: string | null
  sentence: string | null
  hint: string | null
  reviewMode: 'multiple_choice' | 'typed_recall' | 'context'
  options: string[] | null
}

// Reading Stats
export interface ReadingStatsDto {
  totalSeconds: number
  totalWords: number
  booksFinished: number
  currentStreak: number
  longestStreak: number
  todaySeconds: number
  weekSeconds: number
  monthSeconds: number
  avgDailyMinutes: number
  avgWordsPerMinute: number
  dailyGoal: { target: number; today: number; met: boolean } | null
}

export interface DailyStatDto {
  date: string
  totalSeconds: number
  totalWords: number
  sessionCount: number
}

export interface AchievementDto {
  code: string
  unlockedAt: string
}

export interface GoalDto {
  id: string
  goalType: string
  targetValue: number
  year: number
  streakMinMinutes: number
  updatedAt: string
}

// Library
export interface UserLibraryItem {
  editionId: string
  edition: Edition
  progress: ReadingProgressDto | null
  addedAt: string
}

// User Books
export interface UserBookDto {
  id: string
  title: string | null
  author: string | null
  coverPath: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  chapterCount: number
  createdAt: string
}

export interface UserBookChapterDto {
  id: string
  slug: string
  title: string
  html: string
  wordCount: number | null
  prev: ChapterNav | null
  next: ChapterNav | null
}
