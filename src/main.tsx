import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { NetworkProvider } from '@/features/network/NetworkProvider'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <NetworkProvider>
          <App />
        </NetworkProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
