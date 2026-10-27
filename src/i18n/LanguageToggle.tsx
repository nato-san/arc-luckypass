import { useLocale } from './LocaleContext'

export function LanguageToggle() {
  const { locale, setLocale } = useLocale()

  return (
    <div className="flex items-center gap-0.5 text-xs font-medium rounded-lg border border-gray-200 overflow-hidden shrink-0">
      <button
        onClick={() => setLocale('ja')}
        className={`px-2 py-1.5 sm:px-2.5 transition-colors ${
          locale === 'ja'
            ? 'bg-gray-900 text-white'
            : 'text-gray-500 hover:bg-gray-50'
        }`}
        aria-pressed={locale === 'ja'}
      >
        <span className="hidden sm:inline">日本語</span>
        <span className="sm:hidden">JA</span>
      </button>
      <button
        onClick={() => setLocale('en')}
        className={`px-2 py-1.5 sm:px-2.5 transition-colors ${
          locale === 'en'
            ? 'bg-gray-900 text-white'
            : 'text-gray-500 hover:bg-gray-50'
        }`}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
    </div>
  )
}
