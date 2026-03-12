import { HttpError } from './fetchWithRetry'

export function isNotFoundError(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404
}
