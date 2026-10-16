import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
// @ts-expect-error jsx import
import App from './App.jsx'
// @ts-expect-error js import
import { applyFontSize, loadPrefs } from './utils/prefs.js'
// @ts-expect-error js import
import { applyTheme } from './styles/palette.js'

const prefs = loadPrefs()
applyFontSize(prefs.fontSize)
applyTheme(prefs.theme, prefs.mode)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
