import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { type Locale, type TranslationKey, translations } from './translations'

// ── Detect initial locale ─────────────────────────────────────────────────
function detectLocale(): Locale {
  const saved = localStorage.getItem('luckypass-locale')
  if (saved === 'ja' || saved === 'en') return saved
  const lang = navigator.language.toLowerCase()
  return lang.startsWith('ja') ? 'ja' : 'en'
}

// ── Context shape ─────────────────────────────────────────────────────────
interface LocaleContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TranslationKey) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    localStorage.setItem('luckypass-locale', l)
  }, [])

  const t = useCallback(
    (key: TranslationKey): string => translations[key][locale],
    [locale],
  )

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

// Fallback value used when the hook is called outside of a provider tree
// (e.g. during a stale HMR cycle). This prevents a thrown error from
// white-screening the app during hot module replacement.
const FALLBACK: LocaleContextValue = {
  locale: detectLocale(),
  setLocale: () => { /* noop */ },
  t: (key) => translations[key][detectLocale()],
}

// ── Consumer hook ─────────────────────────────────────────────────────────
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  // Return fallback instead of throwing so HMR cycles don't white-screen
  return ctx ?? FALLBACK
}
