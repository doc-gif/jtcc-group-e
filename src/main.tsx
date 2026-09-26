import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initAnalytics } from './app/analytics'
import { installGestureGuards } from './app/gestures'
import { captureInstallPrompt } from './app/installGuide'

initAnalytics()
installGestureGuards()
captureInstallPrompt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
