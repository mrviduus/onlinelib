import { authFetch, API_BASE } from './client'
import { fetchJsonWithRetry } from '../lib/fetchWithRetry'

export interface BlogPostListItemDto {
  id: string
  slug: string
  title: string
  excerpt: string | null
  coverImagePath: string | null
  authorName: string
  tags: string | null
  language: string
  likeCount: number
  commentCount: number
  viewCount: number
  publishedAt: string | null
}

export interface BlogPostDetailDto {
  id: string
  slug: string
  title: string
  content: string
  excerpt: string | null
  coverImagePath: string | null
  authorName: string
  tags: string | null
  language: string
  seoTitle: string | null
  seoDescription: string | null
  likeCount: number
  commentCount: number
  viewCount: number
  isLikedByMe: boolean
  publishedAt: string | null
}

export interface BlogPostListResponse {
  total: number
  items: BlogPostListItemDto[]
}

export interface BlogCommentDto {
  id: string
  userId: string
  userName: string | null
  userPicture: string | null
  text: string
  parentCommentId: string | null
  replies: BlogCommentDto[] | null
  createdAt: string
}

export interface BlogCommentListResponse {
  total: number
  items: BlogCommentDto[]
}

export interface BlogLikeResponse {
  liked: boolean
  likeCount: number
}

// Public
export async function getBlogPosts(
  params?: { language?: string; tag?: string; limit?: number; offset?: number }
): Promise<BlogPostListResponse> {
  const qs = new URLSearchParams()
  if (params?.language) qs.set('language', params.language)
  if (params?.tag) qs.set('tag', params.tag)
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const query = qs.toString()
  return fetchJsonWithRetry<BlogPostListResponse>(
    `${API_BASE}/blog${query ? `?${query}` : ''}`)
}

export async function getBlogPost(slug: string, language?: string): Promise<BlogPostDetailDto> {
  const qs = language ? `?language=${language}` : ''
  try {
    return await authFetch<BlogPostDetailDto>(`/blog/${slug}${qs}`)
  } catch {
    return fetchJsonWithRetry<BlogPostDetailDto>(`${API_BASE}/blog/${slug}${qs}`)
  }
}

export async function getBlogPostComments(
  postId: string,
  params?: { limit?: number; offset?: number }
): Promise<BlogCommentListResponse> {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const query = qs.toString()
  return fetchJsonWithRetry<BlogCommentListResponse>(
    `${API_BASE}/blog/${postId}/comments${query ? `?${query}` : ''}`)
}

// Authenticated
export async function likeBlogPost(postId: string): Promise<BlogLikeResponse> {
  return authFetch<BlogLikeResponse>(`/me/blog/${postId}/like`, { method: 'POST' })
}

export async function unlikeBlogPost(postId: string): Promise<BlogLikeResponse> {
  return authFetch<BlogLikeResponse>(`/me/blog/${postId}/like`, { method: 'DELETE' })
}

export async function addBlogComment(
  postId: string,
  text: string,
  parentCommentId?: string
): Promise<BlogCommentDto> {
  return authFetch<BlogCommentDto>(`/me/blog/${postId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, parentCommentId: parentCommentId || null }),
  })
}

export async function deleteBlogComment(commentId: string): Promise<void> {
  await authFetch<void>(`/me/blog/comments/${commentId}`, { method: 'DELETE' })
}
