import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'mehfil:theme'

function initialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'dark' || saved === 'light' ? saved : 'light'
  } catch {
    return 'light'
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
  }, [theme])
  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark')
  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
