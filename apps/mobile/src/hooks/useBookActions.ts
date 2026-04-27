import { useCallback } from 'react'
import { Alert } from 'react-native'
import {
  libraryApi, readingProgressApi, userBooksApi, createBooksApi,
  type UserLibraryItem, type UserBookDto, type ReadingProgressDto,
} from '@textstack/shared'
import { useLanguage } from '../context/LanguageContext'
import { useToast } from '../context/ToastContext'

interface SavedCtx {
  progressMap: Record<string, ReadingProgressDto>
  setLibrary: React.Dispatch<React.SetStateAction<UserLibraryItem[]>>
  setProgressMap: React.Dispatch<React.SetStateAction<Record<string, ReadingProgressDto>>>
  library: UserLibraryItem[]
}

interface UploadCtx {
  onChange: () => void
  openDetails: (id: string) => void
}

export function useBookActions() {
  const { language, t } = useLanguage()
  const { show: showToast } = useToast()

  const showSavedActions = useCallback((item: UserLibraryItem, ctx: SavedCtx) => {
    const progress = ctx.progressMap[item.editionId]
    const isFinished = progress?.percent === 1
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = []

    buttons.push({
      text: isFinished ? t('library.actions.markUnfinished') : t('library.actions.markFinished'),
      onPress: async () => {
        try {
          const api = createBooksApi(language)
          const book = await api.getBook(item.slug)
          if (book.chapters.length === 0) return
          const ch = isFinished ? book.chapters[0] : book.chapters[book.chapters.length - 1]
          await readingProgressApi.updateProgress(item.editionId, {
            chapterId: ch.id,
            chapterSlug: ch.slug,
            progress: isFinished ? 0 : 1,
          })
          ctx.setProgressMap(prev => ({
            ...prev,
            [item.editionId]: {
              ...prev[item.editionId],
              editionId: item.editionId,
              percent: isFinished ? 0 : 1,
              chapterSlug: ch.slug,
              updatedAt: new Date().toISOString(),
            },
          }))
        } catch (e) {
          console.warn('Toggle finished failed:', e)
          showToast({ message: 'Could not update progress. Try again.', variant: 'error' })
        }
      },
    })

    buttons.push({
      text: t('library.actions.removeFromLibrary'),
      style: 'destructive',
      onPress: async () => {
        const snapshot = ctx.library
        ctx.setLibrary(prev => prev.filter(l => l.editionId !== item.editionId))
        try {
          await libraryApi.removeFromLibrary(item.editionId)
        } catch (e) {
          console.warn('Remove from library failed:', e)
          ctx.setLibrary(snapshot)
          showToast({ message: 'Could not remove book. Try again.', variant: 'error' })
        }
      },
    })

    buttons.push({ text: t('library.actions.cancel'), style: 'cancel' })
    Alert.alert(item.title, undefined, buttons)
  }, [language, t, showToast])

  const showUploadActions = useCallback((item: UserBookDto, ctx: UploadCtx) => {
    const s = item.status.toLowerCase()
    const isReady = s === 'ready' || s === 'completed'
    const isFailed = s === 'failed'
    const isProcessing = !isReady && !isFailed
    const isFinished = !!item.completedAt

    const run = async (fn: () => Promise<unknown>, label: string) => {
      try {
        await fn()
        ctx.onChange()
      } catch (e) {
        console.warn(`${label} failed:`, e)
        showToast({ message: `${label} failed. Try again.`, variant: 'error' })
      }
    }

    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = []

    if (isReady) {
      buttons.push({ text: t('library.actions.viewDetails'), onPress: () => ctx.openDetails(item.id) })
      buttons.push({
        text: isFinished ? t('library.actions.markUnfinished') : t('library.actions.markFinished'),
        onPress: () => run(
          () => isFinished ? userBooksApi.unmarkUserBookComplete(item.id) : userBooksApi.markUserBookComplete(item.id),
          isFinished ? 'Mark as unfinished' : 'Mark as finished',
        ),
      })
    }
    if (isFailed) {
      buttons.push({
        text: t('library.actions.retry'),
        onPress: () => run(() => userBooksApi.retryUserBook(item.id), 'Retry'),
      })
    }
    if (isProcessing) {
      buttons.push({
        text: t('library.actions.cancel'),
        style: 'destructive',
        onPress: () => run(() => userBooksApi.cancelUserBook(item.id), 'Cancel upload'),
      })
    }
    buttons.push({
      text: t('library.actions.delete'),
      style: 'destructive',
      onPress: () => {
        Alert.alert(
          t('library.actions.confirmDeleteTitle'),
          t('library.actions.confirmDeleteBody').replace('{title}', item.title || 'Untitled'),
          [
            { text: t('library.actions.confirmDeleteCancel'), style: 'cancel' },
            {
              text: t('library.actions.confirmDeleteConfirm'),
              style: 'destructive',
              onPress: () => run(() => userBooksApi.deleteUserBook(item.id), 'Delete book'),
            },
          ],
        )
      },
    })
    buttons.push({ text: t('library.actions.cancel'), style: 'cancel' })

    Alert.alert(item.title || 'Untitled', undefined, buttons)
  }, [t, showToast])

  return { showSavedActions, showUploadActions }
}
