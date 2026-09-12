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
        <main className="grid min-h-screen place-items-center bg-[#16111f] p-6 text-center text-slate-100">
          <p>Une erreur inattendue est survenue. Rechargez la page pour reessayer.</p>
        </main>
      )
    }

    return this.props.children
  }
}
