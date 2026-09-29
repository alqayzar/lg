import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unrecoverable application error', error, errorInfo)
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-6 text-center text-[var(--text-color)]">
          <p className="element-shadow max-w-sm rounded-3xl border-4 border-[var(--outline-color)] [--element-color:var(--paper)] p-6 font-bold">Une erreur inattendue est survenue. Rechargez la page pour réessayer.</p>
        </main>
      )
    }

    return this.props.children
  }
}
