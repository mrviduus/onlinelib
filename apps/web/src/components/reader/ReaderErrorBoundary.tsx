import { Component, type ErrorInfo, type ReactNode } from 'react'
import { count } from '../../lib/vocabHighlightTelemetry'

interface Props {
  fallback: ReactNode
  resetKey?: string | number
  children: ReactNode
  onError?: (error: unknown, info: ErrorInfo) => void
}

interface State {
  hasError: boolean
}

export class ReaderErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    count('reader.overlay.error', {
      error: error instanceof Error ? error.message : String(error),
      componentStack: info.componentStack,
    })
    this.props.onError?.(error, info)
  }

  componentDidUpdate(prevProps: Props): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}
