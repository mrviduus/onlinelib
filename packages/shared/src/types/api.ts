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
  moreByAuthor: { id: string; slug: string; title: string; coverPath: string | null }[]
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

// Reading Progress (matches backend ReadingProgressDto)
export interface ReadingProgressDto {
  editionId: string
  chapterId: string
  chapterSlug: string | null
  locator: string
  percent: number | null
  updatedAt: string
}

// Bookmarks
export interface BookmarkDto {
  id: string
  editionId: string
  chapterId: string
  locator: string
  title: string | null
  createdAt: string
  /** Derived from locator for convenience — not from backend */
  chapterSlug?: string
}

// Vocabulary
export interface VocabularyWordDto {
  id: string
  word: string
  language: string
  translation: string | null
  definition: string | null
  editionId: string | null
  chapterId: string | null
  userBookId: string | null
  sentence: string | null
  bookTitle: string | null
  hint: string | null
  stage: number
  intervalDays: number
  consecutiveCorrect: number
  nextReviewAt: string
  lastReviewedAt: string | null
  totalReviews: number
  correctReviews: number
  createdAt: string
  updatedAt: string
}

export interface VocabularyStatsDto {
  totalWords: number
  byStage: {
    new: number
    recognition: number
    recall: number
    context: number
    mastered: number
  }
  dueNow: number
  reviewedToday: number
  correctRateToday: number
  srsReviewedToday: number
  srsCorrectRateToday: number
  practicedToday: number
  practiceCorrectRateToday: number
  totalReviews: number
  overallCorrectRate: number
  streak: number
  wordsByBook: { editionId: string | null; userBookId: string | null; bookTitle: string; count: number }[]
}

export interface ReviewCardDto {
  wordId: string
  word: string
  translation: string | null
  definition: string | null
  reviewMode: 'multiple_choice' | 'typed_recall' | 'context'
  blankSentence: string | null
  originalSentence: string | null
  bookTitle: string | null
  hint: string | null
  options: string[] | null
  correctOptionIndex: number | null
}

export interface SubmitReviewResponse {
  wordId: string
  previousStage: number
  newStage: number
  stageChanged: boolean
  nextIntervalDays: number
  nextReviewAt: string
  totalReviews: number
  correctReviews: number
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

// Library (matches backend LibraryItemDto)
export interface UserLibraryItem {
  editionId: string
  slug: string
  title: string
  language: string
  coverPath: string | null
  createdAt: string
}

// User Books
export interface UserBookDto {
  id: string
  title: string | null
  author: string | null
  coverPath: string | null
  genre: string | null
  totalWordCount: number | null
  status: string
  chapterCount: number
  createdAt: string
  errorMessage: string | null
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
