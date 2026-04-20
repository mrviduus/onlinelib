const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface IngestionJob {
  id: string
  editionId: string
  editionTitle: string
  status: 'Queued' | 'Processing' | 'Succeeded' | 'Failed'
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface UploadResponse {
  workId: string
  editionId: string
  bookFileId: string
  jobId: string
  message: string
}

export interface Edition {
  id: string
  slug: string
  title: string
  language: string
  status: 'Draft' | 'Published' | 'Deleted'
  chapterCount: number
  createdAt: string
  publishedAt: string | null
  authors: string
  seoReady: boolean
}

export interface AdminStats {
  totalEditions: number
  publishedEditions: number
  draftEditions: number
  totalChapters: number
  totalAuthors: number
  totalUsers: number
}

export interface EditionDetail {
  id: string
  workId: string
  siteId: string
  slug: string
  title: string
  language: string
  description: string | null
  coverPath: string | null
  status: string
  isPublicDomain: boolean
  createdAt: string
  publishedAt: string | null
  chapters: Chapter[]
  authors: EditionAuthor[]
  genres: EditionGenre[]
  // SEO fields
  indexable: boolean
  seoTitle: string | null
  seoDescription: string | null
  canonicalOverride: string | null
  // SEO content blocks
  seoRelevanceText: string | null
  seoThemesJson: string | null
  seoFaqsJson: string | null
}

export interface EditionAuthor {
  id: string
  slug: string
  name: string
  order: number
  role: string
}

export interface UpdateEditionAuthor {
  authorId: string
  role: string
}

export interface Chapter {
  id: string
  chapterNumber: number
  slug: string
  title: string
  wordCount: number | null
}

export interface ChapterDetail {
  id: string
  editionId: string
  chapterNumber: number
  slug: string | null
  title: string
  html: string
  wordCount: number | null
  createdAt: string
  updatedAt: string
}

export interface PaginatedResult<T> {
  total: number
  items: T[]
}

// Tools types
export interface ReprocessResult {
  editionsProcessed: number
  chaptersSplit: number
  newPartsCreated: number
  totalChaptersAfter: number
  editions: ReprocessedEdition[]
}

export interface ReprocessedEdition {
  editionId: string
  title: string
  chaptersSplit: number
  newParts: number
  error: string | null
}

export interface ReimportResult {
  reimported: number
  skipped: number
  failed: number
  total: number
  results: ReimportBookResult[]
}

export interface ReimportBookResult {
  book: string
  editionId: string | null
  chapters: number
  images: number
  wasSkipped: boolean
  error: string | null
}

export interface SyncResult {
  total: number
  alreadyImported: number
  cloned: number
  imported: number
  failed: number
  books: SyncBookResult[]
}

export interface SyncBookResult {
  identifier: string
  status: string
  error: string | null
}

export interface RestoreResult {
  totalInDb: number
  alreadyHaveSource: number
  missingSource: number
  availableOnGitHub: number
  restored: number
  failed: number
  books: SyncBookResult[]
}

export interface AuthorSearchResult {
  id: string
  slug: string
  name: string
  bookCount: number
}

export interface AuthorListItem {
  id: string
  slug: string
  name: string
  photoPath: string | null
  bookCount: number
  hasPublishedBooks: boolean
  createdAt: string
  seoReady: boolean
}

export interface AuthorDetail {
  id: string
  siteId: string
  slug: string
  name: string
  bio: string | null
  photoPath: string | null
  indexable: boolean
  seoTitle: string | null
  seoDescription: string | null
  canonicalOverride: string | null
  seoRelevanceText: string | null
  seoThemesJson: string | null
  seoFaqsJson: string | null
  externalLinksJson: string | null
  bookCount: number
  createdAt: string
  books: AuthorBook[]
}

export interface AuthorBook {
  editionId: string
  slug: string
  title: string
  role: string
  status: string
}

export interface CreateAuthorResponse {
  id: string
  slug: string
  name: string
  isNew: boolean
}

export interface AuthorStats {
  total: number
  withPublishedBooks: number
  withoutPublishedBooks: number
  totalBooks: number
}

// Genres
export interface GenreSearchResult {
  id: string
  slug: string
  name: string
  editionCount: number
}

export interface GenreListItem {
  id: string
  slug: string
  name: string
  description: string | null
  indexable: boolean
  editionCount: number
  hasPublishedBooks: boolean
  updatedAt: string
}

export interface GenreDetail {
  id: string
  siteId: string
  slug: string
  name: string
  description: string | null
  indexable: boolean
  seoTitle: string | null
  seoDescription: string | null
  editionCount: number
  createdAt: string
  updatedAt: string
  editions: GenreEdition[]
}

export interface GenreEdition {
  editionId: string
  slug: string
  title: string
  status: string
}

export interface CreateGenreResponse {
  id: string
  slug: string
  name: string
  isNew: boolean
}

export interface GenreStats {
  total: number
  withPublishedBooks: number
  withoutPublishedBooks: number
  totalEditions: number
}

export interface EditionGenre {
  id: string
  slug: string
  name: string
}

// SEO Crawl
export type SeoCrawlJobStatus = 'Queued' | 'Running' | 'Completed' | 'Failed' | 'Cancelled'

export interface SeoCrawlJobListItem {
  id: string
  siteId: string
  siteCode: string
  status: SeoCrawlJobStatus
  totalUrls: number
  maxPages: number
  pagesCrawled: number
  errorsCount: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface SeoCrawlJobDetail {
  id: string
  siteId: string
  siteCode: string
  status: SeoCrawlJobStatus
  totalUrls: number
  maxPages: number
  concurrency: number
  crawlDelayMs: number
  userAgent: string
  pagesCrawled: number
  errorsCount: number
  error: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface SeoCrawlJobStats {
  total: number
  status2xx: number
  status3xx: number
  status4xx: number
  status5xx: number
  missingTitle: number
  missingDescription: number
  missingH1: number
  noIndex: number
}

export interface SeoCrawlResult {
  id: string
  url: string
  urlType: string
  statusCode: number | null
  contentType: string | null
  htmlBytes: number | null
  title: string | null
  metaDescription: string | null
  h1: string | null
  canonical: string | null
  metaRobots: string | null
  xRobotsTag: string | null
  fetchedAt: string
  fetchError: string | null
}

export interface SeoCrawlPreview {
  totalUrls: number
  bookCount: number
  authorCount: number
  genreCount: number
}

export interface CreateSeoCrawlJobRequest {
  siteId: string
  maxPages?: number
  crawlDelayMs?: number
  concurrency?: number
}

// SSG Rebuild
export interface SsgPeriodicSettings {
  enabled: boolean
  intervalHours: number
}

export type SsgRebuildJobStatus = 'Queued' | 'Running' | 'Completed' | 'Failed' | 'Cancelled'
export type SsgRebuildMode = 'Full' | 'Incremental' | 'Specific'

export interface SsgRebuildJobListItem {
  id: string
  siteId: string
  siteCode: string
  mode: SsgRebuildMode
  status: SsgRebuildJobStatus
  totalRoutes: number
  renderedCount: number
  failedCount: number
  concurrency: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface SsgRebuildJobDetail {
  id: string
  siteId: string
  siteCode: string
  mode: SsgRebuildMode
  status: SsgRebuildJobStatus
  totalRoutes: number
  renderedCount: number
  failedCount: number
  concurrency: number
  timeoutMs: number
  error: string | null
  bookSlugs: string[] | null
  authorSlugs: string[] | null
  genreSlugs: string[] | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface SsgRebuildJobStats {
  total: number
  successful: number
  failed: number
  bookRoutes: number
  authorRoutes: number
  genreRoutes: number
  staticRoutes: number
  avgRenderTimeMs: number
}

export interface SsgRebuildResult {
  id: string
  route: string
  routeType: string
  success: boolean
  renderTimeMs: number | null
  error: string | null
  renderedAt: string
}

export interface SsgRebuildPreview {
  totalRoutes: number
  bookCount: number
  authorCount: number
  genreCount: number
  staticCount: number
}

export interface CreateSsgRebuildJobRequest {
  siteId: string
  mode?: SsgRebuildMode
  concurrency?: number
  bookSlugs?: string[]
  authorSlugs?: string[]
  genreSlugs?: string[]
}

// CodeGen
export type CodeGenJobStatus = 'Queued' | 'Running' | 'Completed' | 'Failed' | 'Cancelled'

export interface CodeGenJobListItem {
  id: string
  description: string
  status: CodeGenJobStatus
  maxIterations: number
  completedIterations: number
  branchName: string | null
  prUrl: string | null
  error: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface CodeGenJobDetail extends CodeGenJobListItem {
  logOutput: string | null
}

// Auto Publish
export type AutoPublishJobStatus = 'Queued' | 'Running' | 'GeneratingSeo' | 'AwaitingReview' | 'Publishing' | 'Completed' | 'Failed' | 'Cancelled'

export interface AutoPublishSettings {
  enabled: boolean
  booksPerDay: number
  hourUtc: number
  requireReview: boolean
  language: string
}

export interface AutoPublishJobListItem {
  id: string
  editionId: string
  editionTitle: string
  status: AutoPublishJobStatus
  generatedEditionSeo: boolean
  generatedAuthorSeo: boolean
  priority: boolean
  error: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface AutoPublishJobDetail extends AutoPublishJobListItem {
  logOutput: string | null
}

export interface CandidateEdition {
  id: string
  title: string
  language: string | null
  chapterCount: number
  hasDescription: boolean
  hasRelevance: boolean
  hasThemes: boolean
  hasFaqs: boolean
  createdAt: string
}

// Session Settings
export interface SessionSettings {
  accessTokenExpiryMinutes: number
  refreshTokenExpiryDays: number
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `API error: ${res.status}`)
  }
  return res.json()
}

async function fetchVoid(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `API error: ${res.status}`)
  }
}

// Default site ID for general site (seeded in migrations)
// Single site architecture - this is the only public site
export const DEFAULT_SITE_ID = '11111111-1111-1111-1111-111111111111'

export interface BlogPostListItem {
  id: string
  slug: string
  title: string
  authorName: string
  language: string
  status: string
  likeCount: number
  commentCount: number
  viewCount: number
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BlogPostDetail {
  id: string
  slug: string
  title: string
  content: string
  excerpt: string | null
  coverImagePath: string | null
  authorName: string
  tags: string | null
  language: string
  status: string
  seoTitle: string | null
  seoDescription: string | null
  likeCount: number
  commentCount: number
  viewCount: number
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BlogStats {
  total: number
  published: number
  draft: number
  totalComments: number
  totalLikes: number
}

export interface BoardTaskDto {
  id: string
  title: string
  status: 'todo' | 'doing' | 'done'
  order: number
  source: string
  createdAt: string
  updatedAt: string
}

// Book Quality
export type BookQualityJobStatus = 'Queued' | 'Validating' | 'Fixing' | 'Completed' | 'Failed' | 'Cancelled'

export interface BookQualityJobListItem {
  id: string
  editionId: string | null
  userBookId: string | null
  status: BookQualityJobStatus
  issuesFound: number | null
  issuesFixed: number | null
  error: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  editionTitle: string | null
  userBookTitle: string | null
}

export interface BookQualityJobDetail extends BookQualityJobListItem {
  issuesJson: string | null
  logOutput: string | null
}

export interface BookQualitySettings {
  autoQueueAfterIngestion: boolean
  autoQueueForUserBooks: boolean
}

// User Uploads
export interface UserUploadListItem {
  id: string
  title: string
  author: string | null
  language: string
  status: 'Processing' | 'Ready' | 'Failed'
  chapterCount: number
  totalWordCount: number | null
  fileSize: number
  sourceFormat: string | null
  originalFileName: string | null
  userEmail: string
  isGuest: boolean
  errorMessage: string | null
  createdAt: string
}

export interface UserUploadStats {
  total: number
  processing: number
  ready: number
  failed: number
  guestUploads: number
  registeredUploads: number
  totalStorageBytes: number
}

export const adminApi = {
  uploadBook: async (params: {
    file: File
    title: string
    language: string
    siteId?: string
    description?: string
    authorIds?: string[]
    genreId?: string
  }): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', params.file)
    formData.append('siteId', params.siteId || DEFAULT_SITE_ID)
    formData.append('title', params.title)
    formData.append('language', params.language)
    if (params.description) formData.append('description', params.description)
    if (params.authorIds?.length) formData.append('authorIds', params.authorIds.join(','))
    if (params.genreId) formData.append('genreId', params.genreId)

    return fetchJson<UploadResponse>('/admin/books/upload', {
      method: 'POST',
      body: formData,
    })
  },

  getJobs: async (): Promise<IngestionJob[]> => {
    return fetchJson<IngestionJob[]>('/admin/ingestion/jobs')
  },

  getJob: async (id: string): Promise<IngestionJob> => {
    return fetchJson<IngestionJob>(`/admin/ingestion/jobs/${id}`)
  },

  // Stats
  getStats: async (params?: { siteId?: string }): Promise<AdminStats> => {
    const query = new URLSearchParams()
    if (params?.siteId) query.set('siteId', params.siteId)
    const qs = query.toString()
    return fetchJson<AdminStats>(`/admin/stats${qs ? `?${qs}` : ''}`)
  },

  // Editions
  getEditions: async (params?: { status?: string; search?: string; language?: string; indexable?: boolean; seoReady?: boolean; limit?: number; offset?: number; sort?: string; sortOrder?: string }): Promise<PaginatedResult<Edition>> => {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.search) query.set('search', params.search)
    if (params?.language) query.set('language', params.language)
    if (params?.indexable !== undefined) query.set('indexable', String(params.indexable))
    if (params?.seoReady !== undefined) query.set('seoReady', String(params.seoReady))
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    if (params?.sort) query.set('sort', params.sort)
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder)
    const qs = query.toString()
    return fetchJson<PaginatedResult<Edition>>(`/admin/editions${qs ? `?${qs}` : ''}`)
  },

  getEdition: async (id: string): Promise<EditionDetail> => {
    return fetchJson<EditionDetail>(`/admin/editions/${id}`)
  },

  updateEdition: async (id: string, data: {
    title: string
    description?: string | null
    indexable?: boolean
    seoTitle?: string | null
    seoDescription?: string | null
    canonicalOverride?: string | null
    // SEO content blocks
    seoRelevanceText?: string | null
    seoThemesJson?: string | null
    seoFaqsJson?: string | null
    authors?: UpdateEditionAuthor[] | null
    genreIds?: string[] | null
  }): Promise<void> => {
    await fetchVoid(`/admin/editions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  deleteEdition: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/editions/${id}`, { method: 'DELETE' })
  },

  publishEdition: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/editions/${id}/publish`, { method: 'POST' })
  },

  unpublishEdition: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/editions/${id}/unpublish`, { method: 'POST' })
  },

  uploadEditionCover: async (id: string, file: File): Promise<{ coverPath: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    return fetchJson<{ coverPath: string }>(`/admin/editions/${id}/cover`, {
      method: 'POST',
      body: formData,
    })
  },

  deleteEditionCover: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/editions/${id}/cover`, { method: 'DELETE' })
  },

  // Authors
  searchAuthors: async (siteId: string, query?: string, limit?: number): Promise<AuthorSearchResult[]> => {
    const params = new URLSearchParams({ siteId })
    if (query) params.set('q', query)
    if (limit) params.set('limit', String(limit))
    return fetchJson<AuthorSearchResult[]>(`/admin/authors/search?${params}`)
  },

  createAuthor: async (siteId: string, name: string): Promise<CreateAuthorResponse> => {
    return fetchJson<CreateAuthorResponse>('/admin/authors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, name }),
    })
  },

  getAuthors: async (params: { siteId: string; search?: string; hasPublishedBooks?: boolean; seoReady?: boolean; offset?: number; limit?: number; sort?: string; sortOrder?: string }): Promise<PaginatedResult<AuthorListItem>> => {
    const query = new URLSearchParams({ siteId: params.siteId })
    if (params.search) query.set('search', params.search)
    if (params.hasPublishedBooks !== undefined) query.set('hasPublishedBooks', String(params.hasPublishedBooks))
    if (params.seoReady !== undefined) query.set('seoReady', String(params.seoReady))
    if (params.offset) query.set('offset', String(params.offset))
    if (params.limit) query.set('limit', String(params.limit))
    if (params.sort) query.set('sort', params.sort)
    if (params.sortOrder) query.set('sortOrder', params.sortOrder)
    return fetchJson<PaginatedResult<AuthorListItem>>(`/admin/authors?${query}`)
  },

  getAuthorStats: async (siteId: string): Promise<AuthorStats> => {
    return fetchJson<AuthorStats>(`/admin/authors/stats?siteId=${siteId}`)
  },

  getAuthor: async (id: string): Promise<AuthorDetail> => {
    return fetchJson<AuthorDetail>(`/admin/authors/${id}`)
  },

  updateAuthor: async (id: string, data: {
    name: string
    bio?: string | null
    indexable?: boolean
    seoTitle?: string | null
    seoDescription?: string | null
    canonicalOverride?: string | null
    seoRelevanceText?: string | null
    seoThemesJson?: string | null
    seoFaqsJson?: string | null
    externalLinksJson?: string | null
  }): Promise<void> => {
    await fetchVoid(`/admin/authors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  deleteAuthor: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/authors/${id}`, { method: 'DELETE' })
  },

  uploadAuthorPhoto: async (id: string, file: File): Promise<{ photoPath: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    return fetchJson<{ photoPath: string }>(`/admin/authors/${id}/photo`, {
      method: 'POST',
      body: formData,
    })
  },

  deleteAuthorPhoto: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/authors/${id}/photo`, { method: 'DELETE' })
  },

  // Genres
  searchGenres: async (siteId: string, query?: string, limit?: number): Promise<GenreSearchResult[]> => {
    const params = new URLSearchParams({ siteId })
    if (query) params.set('q', query)
    if (limit) params.set('limit', String(limit))
    return fetchJson<GenreSearchResult[]>(`/admin/genres/search?${params}`)
  },

  createGenre: async (siteId: string, name: string): Promise<CreateGenreResponse> => {
    return fetchJson<CreateGenreResponse>('/admin/genres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, name }),
    })
  },

  getGenres: async (params: { siteId: string; search?: string; indexable?: boolean; hasPublishedBooks?: boolean; offset?: number; limit?: number }): Promise<PaginatedResult<GenreListItem>> => {
    const query = new URLSearchParams({ siteId: params.siteId })
    if (params.search) query.set('search', params.search)
    if (params.indexable !== undefined) query.set('indexable', String(params.indexable))
    if (params.hasPublishedBooks !== undefined) query.set('hasPublishedBooks', String(params.hasPublishedBooks))
    if (params.offset) query.set('offset', String(params.offset))
    if (params.limit) query.set('limit', String(params.limit))
    return fetchJson<PaginatedResult<GenreListItem>>(`/admin/genres?${query}`)
  },

  getGenreStats: async (siteId: string): Promise<GenreStats> => {
    return fetchJson<GenreStats>(`/admin/genres/stats?siteId=${siteId}`)
  },

  getGenre: async (id: string): Promise<GenreDetail> => {
    return fetchJson<GenreDetail>(`/admin/genres/${id}`)
  },

  updateGenre: async (id: string, data: {
    name: string
    description?: string | null
    indexable?: boolean
    seoTitle?: string | null
    seoDescription?: string | null
  }): Promise<void> => {
    await fetchVoid(`/admin/genres/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  deleteGenre: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/genres/${id}`, { method: 'DELETE' })
  },

  // Chapters
  getChapter: async (id: string): Promise<ChapterDetail> => {
    return fetchJson<ChapterDetail>(`/admin/chapters/${id}`)
  },

  updateChapter: async (id: string, data: { title: string; html: string }): Promise<void> => {
    await fetchVoid(`/admin/chapters/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  deleteChapter: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/chapters/${id}`, { method: 'DELETE' })
  },

  // SEO Crawl
  getSeoCrawlPreview: async (siteId: string): Promise<SeoCrawlPreview> => {
    return fetchJson<SeoCrawlPreview>(`/admin/seo-crawl/preview?siteId=${siteId}`)
  },

  getSeoCrawlJobs: async (params?: { siteId?: string; status?: SeoCrawlJobStatus; limit?: number; offset?: number }): Promise<PaginatedResult<SeoCrawlJobListItem>> => {
    const query = new URLSearchParams()
    if (params?.siteId) query.set('siteId', params.siteId)
    if (params?.status) query.set('status', params.status)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return fetchJson<PaginatedResult<SeoCrawlJobListItem>>(`/admin/seo-crawl/jobs${qs ? `?${qs}` : ''}`)
  },

  getSeoCrawlJob: async (id: string): Promise<SeoCrawlJobDetail> => {
    return fetchJson<SeoCrawlJobDetail>(`/admin/seo-crawl/jobs/${id}`)
  },

  createSeoCrawlJob: async (data: CreateSeoCrawlJobRequest): Promise<{ id: string }> => {
    return fetchJson<{ id: string }>('/admin/seo-crawl/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  startSeoCrawlJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/seo-crawl/jobs/${id}/start`, { method: 'POST' })
  },

  cancelSeoCrawlJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/seo-crawl/jobs/${id}/cancel`, { method: 'POST' })
  },

  getSeoCrawlJobStats: async (id: string): Promise<SeoCrawlJobStats> => {
    return fetchJson<SeoCrawlJobStats>(`/admin/seo-crawl/jobs/${id}/stats`)
  },

  getSeoCrawlResults: async (id: string, params?: { statusCodeMin?: number; statusCodeMax?: number; missingTitle?: boolean; missingDescription?: boolean; missingH1?: boolean; limit?: number; offset?: number }): Promise<PaginatedResult<SeoCrawlResult>> => {
    const query = new URLSearchParams()
    if (params?.statusCodeMin !== undefined) query.set('statusCodeMin', String(params.statusCodeMin))
    if (params?.statusCodeMax !== undefined) query.set('statusCodeMax', String(params.statusCodeMax))
    if (params?.missingTitle !== undefined) query.set('missingTitle', String(params.missingTitle))
    if (params?.missingDescription !== undefined) query.set('missingDescription', String(params.missingDescription))
    if (params?.missingH1 !== undefined) query.set('missingH1', String(params.missingH1))
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return fetchJson<PaginatedResult<SeoCrawlResult>>(`/admin/seo-crawl/jobs/${id}/results${qs ? `?${qs}` : ''}`)
  },

  getSeoCrawlExportUrl: (id: string): string => {
    return `${API_BASE}/admin/seo-crawl/jobs/${id}/export.csv`
  },

  // Tools
  reprocessAllEditions: async (siteId: string): Promise<ReprocessResult> => {
    return fetchJson<ReprocessResult>(`/admin/reprocess/all?siteId=${siteId}`, {
      method: 'POST',
    })
  },

  reimportTextStack: async (siteId: string, path?: string): Promise<ReimportResult> => {
    return fetchJson<ReimportResult>('/admin/reimport/textstack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, path }),
    })
  },

  syncStandardEbooks: async (siteId: string, limit?: number): Promise<SyncResult> => {
    return fetchJson<SyncResult>('/admin/sync/standardebooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, limit: limit || null }),
    })
  },

  restoreStandardEbooksSources: async (siteId: string, limit?: number): Promise<RestoreResult> => {
    return fetchJson<RestoreResult>('/admin/restore/standardebooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, limit: limit || null }),
    })
  },

  // SSG Rebuild
  getSsgSettings: async (): Promise<SsgPeriodicSettings> => {
    return fetchJson<SsgPeriodicSettings>('/admin/ssg/settings')
  },

  updateSsgSettings: async (data: SsgPeriodicSettings): Promise<void> => {
    await fetchVoid('/admin/ssg/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  getSsgRebuildPreview: async (siteId: string, mode?: SsgRebuildMode): Promise<SsgRebuildPreview> => {
    const query = new URLSearchParams({ siteId })
    if (mode) query.set('mode', mode)
    return fetchJson<SsgRebuildPreview>(`/admin/ssg/preview?${query}`)
  },

  getSsgRebuildJobs: async (params?: { siteId?: string; status?: SsgRebuildJobStatus; limit?: number; offset?: number }): Promise<PaginatedResult<SsgRebuildJobListItem>> => {
    const query = new URLSearchParams()
    if (params?.siteId) query.set('siteId', params.siteId)
    if (params?.status) query.set('status', params.status)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return fetchJson<PaginatedResult<SsgRebuildJobListItem>>(`/admin/ssg/jobs${qs ? `?${qs}` : ''}`)
  },

  getSsgRebuildJob: async (id: string): Promise<SsgRebuildJobDetail> => {
    return fetchJson<SsgRebuildJobDetail>(`/admin/ssg/jobs/${id}`)
  },

  createSsgRebuildJob: async (data: CreateSsgRebuildJobRequest): Promise<{ id: string }> => {
    return fetchJson<{ id: string }>('/admin/ssg/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  startSsgRebuildJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/ssg/jobs/${id}/start`, { method: 'POST' })
  },

  cancelSsgRebuildJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/ssg/jobs/${id}/cancel`, { method: 'POST' })
  },

  getSsgRebuildJobStats: async (id: string): Promise<SsgRebuildJobStats> => {
    return fetchJson<SsgRebuildJobStats>(`/admin/ssg/jobs/${id}/stats`)
  },

  getSsgRebuildResults: async (id: string, params?: { failed?: boolean; routeType?: string; limit?: number; offset?: number }): Promise<PaginatedResult<SsgRebuildResult>> => {
    const query = new URLSearchParams()
    if (params?.failed !== undefined) query.set('failed', String(params.failed))
    if (params?.routeType) query.set('routeType', params.routeType)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return fetchJson<PaginatedResult<SsgRebuildResult>>(`/admin/ssg/jobs/${id}/results${qs ? `?${qs}` : ''}`)
  },

  // Session Settings
  getSessionSettings: async (): Promise<SessionSettings> => {
    return fetchJson<SessionSettings>('/admin/settings/session')
  },

  updateSessionSettings: async (data: Partial<SessionSettings>): Promise<SessionSettings> => {
    return fetchJson<SessionSettings>('/admin/settings/session', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  // Blog
  getBlogPosts: async (params?: { search?: string; status?: string; language?: string; offset?: number; limit?: number }): Promise<PaginatedResult<BlogPostListItem>> => {
    const query = new URLSearchParams({ siteId: DEFAULT_SITE_ID })
    if (params?.search) query.set('search', params.search)
    if (params?.status) query.set('status', params.status)
    if (params?.language) query.set('language', params.language)
    if (params?.offset) query.set('offset', String(params.offset))
    if (params?.limit) query.set('limit', String(params.limit))
    return fetchJson<PaginatedResult<BlogPostListItem>>(`/admin/blog?${query}`)
  },

  getBlogPost: async (id: string): Promise<BlogPostDetail> => {
    return fetchJson<BlogPostDetail>(`/admin/blog/${id}?siteId=${DEFAULT_SITE_ID}`)
  },

  createBlogPost: async (data: { title: string; content: string; language: string; authorName: string; excerpt?: string; tags?: string; seoTitle?: string; seoDescription?: string }): Promise<BlogPostDetail> => {
    return fetchJson<BlogPostDetail>(`/admin/blog?siteId=${DEFAULT_SITE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  updateBlogPost: async (id: string, data: { title: string; content: string; language: string; authorName: string; excerpt?: string; tags?: string; seoTitle?: string; seoDescription?: string }): Promise<BlogPostDetail> => {
    return fetchJson<BlogPostDetail>(`/admin/blog/${id}?siteId=${DEFAULT_SITE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  deleteBlogPost: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/blog/${id}?siteId=${DEFAULT_SITE_ID}`, { method: 'DELETE' })
  },

  publishBlogPost: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/blog/${id}/publish?siteId=${DEFAULT_SITE_ID}`, { method: 'POST' })
  },

  unpublishBlogPost: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/blog/${id}/unpublish?siteId=${DEFAULT_SITE_ID}`, { method: 'POST' })
  },

  uploadBlogCover: async (id: string, file: File): Promise<{ coverImagePath: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    return fetchJson<{ coverImagePath: string }>(`/admin/blog/${id}/cover?siteId=${DEFAULT_SITE_ID}`, {
      method: 'POST',
      body: formData,
    })
  },

  deleteBlogCover: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/blog/${id}/cover?siteId=${DEFAULT_SITE_ID}`, { method: 'DELETE' })
  },

  getBlogStats: async (): Promise<BlogStats> => {
    return fetchJson<BlogStats>(`/admin/blog/stats?siteId=${DEFAULT_SITE_ID}`)
  },

  // CodeGen
  getCodeGenJobs: async (params?: { limit?: number; offset?: number }): Promise<PaginatedResult<CodeGenJobListItem>> => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return fetchJson<PaginatedResult<CodeGenJobListItem>>(`/admin/codegen/jobs${qs ? `?${qs}` : ''}`)
  },

  getCodeGenJob: async (id: string): Promise<CodeGenJobDetail> => {
    return fetchJson<CodeGenJobDetail>(`/admin/codegen/jobs/${id}`)
  },

  createCodeGenJob: async (data: { description: string; maxIterations?: number }): Promise<{ id: string }> => {
    return fetchJson<{ id: string }>('/admin/codegen/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  startCodeGenJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/codegen/jobs/${id}/start`, { method: 'POST' })
  },

  cancelCodeGenJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/codegen/jobs/${id}/cancel`, { method: 'POST' })
  },

  rerunCodeGenJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/codegen/jobs/${id}/rerun`, { method: 'POST' })
  },

  // Auto Publish
  getAutoPublishSettings: async (): Promise<AutoPublishSettings> => {
    return fetchJson<AutoPublishSettings>('/admin/autopublish/settings')
  },

  updateAutoPublishSettings: async (data: AutoPublishSettings): Promise<void> => {
    await fetchVoid('/admin/autopublish/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  getAutoPublishJobs: async (params?: { limit?: number; offset?: number; status?: string }): Promise<PaginatedResult<AutoPublishJobListItem>> => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    if (params?.status) query.set('status', params.status)
    const qs = query.toString()
    return fetchJson<PaginatedResult<AutoPublishJobListItem>>(`/admin/autopublish/jobs${qs ? `?${qs}` : ''}`)
  },

  getAutoPublishJob: async (id: string): Promise<AutoPublishJobDetail> => {
    return fetchJson<AutoPublishJobDetail>(`/admin/autopublish/jobs/${id}`)
  },

  approveAutoPublishJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/autopublish/jobs/${id}/approve`, { method: 'POST' })
  },

  rejectAutoPublishJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/autopublish/jobs/${id}/reject`, { method: 'POST' })
  },

  retryAutoPublishJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/autopublish/jobs/${id}/retry`, { method: 'POST' })
  },

  triggerAutoPublish: async (): Promise<{ id: string }> => {
    return fetchJson<{ id: string }>('/admin/autopublish/trigger', { method: 'POST' })
  },

  queueAutoPublishEdition: async (editionId: string): Promise<{ id: string }> => {
    return fetchJson<{ id: string }>(`/admin/autopublish/queue/${editionId}`, { method: 'POST' })
  },

  getAutoPublishCandidates: async (limit?: number): Promise<CandidateEdition[]> => {
    const qs = limit ? `?limit=${limit}` : ''
    return fetchJson<CandidateEdition[]>(`/admin/autopublish/candidates${qs}`)
  },

  // Board Tasks
  getBoardTasks: async (): Promise<BoardTaskDto[]> => {
    return fetchJson<BoardTaskDto[]>('/admin/tasks')
  },

  createBoardTask: async (title: string, source?: string): Promise<BoardTaskDto> => {
    return fetchJson<BoardTaskDto>('/admin/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, source: source || 'manual' }),
    })
  },

  updateBoardTask: async (id: string, title: string): Promise<BoardTaskDto> => {
    return fetchJson<BoardTaskDto>(`/admin/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
  },

  deleteBoardTask: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/tasks/${id}`, { method: 'DELETE' })
  },

  reorderBoardTasks: async (items: { id: string; status: string; order: number }[]): Promise<void> => {
    await fetchVoid('/admin/tasks/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
  },

  // User Uploads
  getUserUploads: async (params?: { status?: string; userType?: string; search?: string; limit?: number; offset?: number }): Promise<PaginatedResult<UserUploadListItem>> => {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.userType) query.set('userType', params.userType)
    if (params?.search) query.set('search', params.search)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return fetchJson<PaginatedResult<UserUploadListItem>>(`/admin/user-uploads${qs ? `?${qs}` : ''}`)
  },

  getUserUploadStats: async (): Promise<UserUploadStats> => {
    return fetchJson<UserUploadStats>('/admin/user-uploads/stats')
  },

  deleteUserUpload: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/user-uploads/${id}`, { method: 'DELETE' })
  },

  // Book Quality
  getBookQualitySettings: async (): Promise<BookQualitySettings> => {
    return fetchJson<BookQualitySettings>('/admin/quality/settings')
  },

  updateBookQualitySettings: async (data: BookQualitySettings): Promise<void> => {
    await fetchVoid('/admin/quality/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  getBookQualityJobs: async (params?: { limit?: number; offset?: number; status?: string }): Promise<PaginatedResult<BookQualityJobListItem>> => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    if (params?.status) query.set('status', params.status)
    const qs = query.toString()
    return fetchJson<PaginatedResult<BookQualityJobListItem>>(`/admin/quality/jobs${qs ? `?${qs}` : ''}`)
  },

  getBookQualityJob: async (id: string): Promise<BookQualityJobDetail> => {
    return fetchJson<BookQualityJobDetail>(`/admin/quality/jobs/${id}`)
  },

  createBookQualityJob: async (data: { editionId?: string; userBookId?: string }): Promise<{ id: string }> => {
    return fetchJson<{ id: string }>('/admin/quality/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  cancelBookQualityJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/quality/jobs/${id}/cancel`, { method: 'POST' })
  },

  retryBookQualityJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/quality/jobs/${id}/retry`, { method: 'POST' })
  },

  // ── SEO Backfill ──
  getSeoCoverage: async (): Promise<SeoCoverageStat[]> => {
    return fetchJson<SeoCoverageStat[]>('/admin/seo/coverage')
  },

  getSeoGaps: async (params: { entityType: string; language?: string; limit?: number }): Promise<SeoGapRow[]> => {
    const qs = new URLSearchParams({ entityType: params.entityType })
    if (params.language) qs.set('language', params.language)
    if (params.limit !== undefined) qs.set('limit', String(params.limit))
    return fetchJson<SeoGapRow[]>(`/admin/seo/gaps?${qs}`)
  },

  getSeoTemplates: async (params?: { entityType?: string; onlyActive?: boolean }): Promise<SeoTemplateListItem[]> => {
    const qs = new URLSearchParams()
    if (params?.entityType) qs.set('entityType', params.entityType)
    if (params?.onlyActive !== undefined) qs.set('onlyActive', params.onlyActive.toString())
    const tail = qs.toString()
    return fetchJson<SeoTemplateListItem[]>(`/admin/seo/templates${tail ? `?${tail}` : ''}`)
  },

  getSeoTemplate: async (id: string): Promise<SeoTemplateDetail> => {
    return fetchJson<SeoTemplateDetail>(`/admin/seo/templates/${id}`)
  },

  createSeoTemplate: async (data: SeoTemplateUpsert): Promise<{ id: string; version: number }> => {
    return fetchJson(`/admin/seo/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  updateSeoTemplate: async (id: string, data: SeoTemplateUpsert): Promise<{ id: string; version: number }> => {
    return fetchJson(`/admin/seo/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  deactivateSeoTemplate: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/seo/templates/${id}`, { method: 'DELETE' })
  },

  previewSeoTemplate: async (id: string, entityId: string): Promise<SeoTemplatePreview> => {
    return fetchJson<SeoTemplatePreview>(`/admin/seo/templates/${id}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId }),
    })
  },

  getSeoJobs: async (params?: { status?: string; entityType?: string; offset?: number; limit?: number }): Promise<{ total: number; items: SeoBackfillJobListItem[] }> => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.entityType) qs.set('entityType', params.entityType)
    if (params?.offset !== undefined) qs.set('offset', params.offset.toString())
    if (params?.limit !== undefined) qs.set('limit', params.limit.toString())
    const tail = qs.toString()
    return fetchJson(`/admin/seo/jobs${tail ? `?${tail}` : ''}`)
  },

  getSeoJob: async (id: string): Promise<SeoBackfillJobDetail> => {
    return fetchJson<SeoBackfillJobDetail>(`/admin/seo/jobs/${id}`)
  },

  approveSeoJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/seo/jobs/${id}/approve`, { method: 'POST' })
  },

  revertSeoJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/seo/jobs/${id}/revert`, { method: 'POST' })
  },

  retrySeoJob: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/seo/jobs/${id}/retry`, { method: 'POST' })
  },

  queueSeoEntity: async (data: { entityType: string; entityId: string; fields: string[]; language?: string; requireReview?: boolean }): Promise<{ jobId: string }> => {
    return fetchJson(`/admin/seo/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  getSeoSettings: async (): Promise<SeoBackfillSettings> => {
    return fetchJson<SeoBackfillSettings>('/admin/seo/settings')
  },

  updateSeoSettings: async (data: Partial<SeoBackfillSettings>): Promise<void> => {
    await fetchVoid('/admin/seo/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  },

  // Highlight reports (ambient social moderation)
  getHighlightReports: async (params?: {
    status?: 'open' | 'resolved' | 'all'
    limit?: number
    offset?: number
  }): Promise<{ items: HighlightReport[]; totalCount: number }> => {
    const query = new URLSearchParams({ siteId: DEFAULT_SITE_ID })
    if (params?.status) query.set('status', params.status)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    return fetchJson(`/admin/highlights/reports?${query.toString()}`)
  },

  resolveHighlightReport: async (id: string, action: 'dismiss' | 'delete'): Promise<void> => {
    await fetchVoid(`/admin/highlights/reports/${id}/resolve?siteId=${DEFAULT_SITE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
  },

  deleteHighlight: async (id: string): Promise<void> => {
    await fetchVoid(`/admin/highlights/${id}?siteId=${DEFAULT_SITE_ID}`, { method: 'DELETE' })
  },
}

export interface HighlightReport {
  id: string
  highlightId: string
  highlightUserId: string
  selectedText: string
  noteText: string | null
  highlightIsDeleted: boolean
  editionId: string | null
  chapterId: string | null
  editionTitle: string | null
  chapterTitle: string | null
  reportedByUserId: string
  reason: string
  note: string | null
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
}

// SEO Backfill types
export interface SeoCoverageStat {
  entityType: string
  fieldType: string
  total: number
  populated: number
  missing: number
}

export interface SeoGapRow {
  entityType: string
  entityId: string
  label: string
  language: string
  missingFields: string[]
}

export interface SeoTemplateListItem {
  id: string
  entityType: string
  fieldType: string
  languageCode: string
  name: string
  description: string | null
  model: string
  maxTokens: number
  temperature: number
  trustLevel: string
  version: number
  isActive: boolean
  updatedAt: string
}

export interface SeoTemplateDetail extends SeoTemplateListItem {
  promptTemplate: string
  outputSchema: string
  createdAt: string
}

export interface SeoTemplateUpsert {
  entityType: string
  fieldType: string
  languageCode: string
  name: string
  description?: string
  promptTemplate: string
  outputSchema: string
  model?: string
  maxTokens?: number
  temperature?: number
  trustLevel?: string
}

export interface SeoTemplatePreview {
  rendered: string
  missingPlaceholders: string[]
  values: Record<string, string | null>
}

export interface SeoBackfillJobListItem {
  id: string
  entityType: string
  entityId: string
  targetFields: string[]
  status: string
  error: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  triggeredBy: string
  requiresReview: boolean
}

export interface SeoBackfillJobDetail extends SeoBackfillJobListItem {
  templateIds: string[]
  templateVersions: number[]
  inputSnapshot: string | null
  renderedPrompts: string | null
  rawOutputs: string | null
  generatedContent: string | null
  beforeSnapshot: string | null
  afterSnapshot: string | null
  approvedByUserId: string | null
  approvedAt: string | null
}

export interface SeoBackfillSettings {
  enabled: boolean
  jobsPerRun: number
  intervalSeconds: number
  languageFilter: string[]
  entityTypeFilter: string[]
  ssgRebuildBatchMinutes: number
}
